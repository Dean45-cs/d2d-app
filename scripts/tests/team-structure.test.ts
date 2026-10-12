import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTeamStructure, type StructureMember, type StructureNode } from "../../src/lib/team-structure";

function member(id: number, managerId: number | null, overrides: Partial<StructureMember> = {}): StructureMember {
  return { id, manager_id: managerId, team_id: 1, name: `Person ${id}`, role: "MEMBER", active: 1, avatar: "", ...overrides };
}

function flatten(roots: StructureNode[]): StructureNode[] {
  const result: StructureNode[] = [];
  const pending = [...roots];
  while (pending.length) {
    const node = pending.pop()!;
    result.push(node);
    pending.push(...node.children);
  }
  return result;
}

test("keeps multiple leaders, unassigned members and inactive managers with accurate subtree counts", () => {
  const input = [
    member(5, 3), member(4, 2), member(2, 1, { active: 0 }),
    member(1, null, { role: "LEADER" }), member(6, null, { role: "LEADER" }),
    member(3, 1), member(7, null),
  ];
  const roots = buildTeamStructure(input);
  assert.deepEqual(roots.map((node) => [node.member.id, node.rootReason, node.descendantCount]), [
    [1, "top", 4], [6, "top", 0], [7, "unassigned", 0],
  ]);
  assert.deepEqual(roots[0].children.map((node) => node.member.id), [3, 2]);
  const inactive = roots[0].children[1];
  assert.equal(inactive.member.active, 0);
  assert.equal(inactive.descendantCount, 1);
  assert.equal(inactive.children[0].member.id, 4);
  assert.equal(inactive.rootReason, null);
  assert.deepEqual(flatten(roots).map((node) => node.member.id).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
});

test("a filtered view stays inside its supplied scope and does not mistake a hidden parent for no assignment", () => {
  const roots = buildTeamStructure([member(3, 2), member(2, 1), member(4, null)]);
  assert.deepEqual(roots.map((node) => [node.member.id, node.rootReason]), [[2, "outside"], [4, "unassigned"]]);
  assert.equal(roots[0].descendantCount, 1);
  assert.equal(roots[0].children[0].member.id, 3);
  assert.equal(flatten(roots).length, 3);
});

test("does not connect a reporting line across teams even when the parent is supplied", () => {
  const roots = buildTeamStructure([
    member(1, null, { role: "LEADER", team_id: 2 }), member(2, 1), member(3, 2),
  ]);
  assert.equal(roots.length, 2);
  assert.equal(roots[0].descendantCount, 0);
  assert.equal(roots[1].rootReason, "outside");
  assert.equal(roots[1].descendantCount, 1);
});

test("breaks cycles deterministically without dropping valid branches or looping on self-reporting", () => {
  const input = [
    member(1, 3, { name: "Bea" }), member(2, 1, { name: "Carla" }), member(3, 2, { name: "Anna" }),
    member(4, 2, { name: "A child before the cycle" }), member(5, 4),
    member(6, 6), member(7, 6),
  ];
  const roots = buildTeamStructure(input);
  assert.deepEqual(roots.map((node) => [node.member.id, node.rootReason, node.descendantCount]), [[3, "cycle", 4], [6, "cycle", 1]]);
  assert.deepEqual(flatten(roots).map((node) => node.member.id).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(roots[0].children[0].member.id, 1);
  assert.equal(roots[0].children[0].children[0].member.id, 2);
  assert.equal(roots[0].children[0].children[0].children[0].member.id, 4);
  assert.deepEqual(buildTeamStructure([...input].reverse()), roots);
});

test("sorts by role, active state, German name and ID without mutating the input", () => {
  const input = [
    member(7, null, { name: "Anna" }), member(6, null, { name: "Anna" }),
    member(5, null, { name: "Zoe", role: "LEADER", active: 0 }),
    member(4, null, { name: "Änne" }), member(3, null, { name: "Zoe" }),
    member(2, null, { name: "A inactive", active: 0 }),
    member(1, null, { name: "Zoe", role: "LEADER" }),
  ];
  const before = structuredClone(input);
  for (const person of input) Object.freeze(person);
  Object.freeze(input);
  assert.deepEqual(buildTeamStructure(input).map((node) => node.member.id), [1, 5, 6, 7, 4, 3, 2]);
  assert.deepEqual(input, before);
  assert.deepEqual(buildTeamStructure([...input].reverse()), buildTeamStructure(input));
  assert.deepEqual(buildTeamStructure([]), []);
});

test("counts deep structures without recursive stack overflow", () => {
  const input = Array.from({ length: 12000 }, (_, index) => member(index + 1, index === 0 ? null : index, {
    role: index === 0 ? "LEADER" : "MEMBER",
  }));
  const roots = buildTeamStructure(input);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].descendantCount, input.length - 1);
  assert.equal(flatten(roots).length, input.length);
});
