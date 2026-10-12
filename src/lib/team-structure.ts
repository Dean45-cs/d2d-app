import type { User } from "./types";

export type StructureMember = Pick<User, "id" | "team_id" | "manager_id" | "name" | "role" | "active" | "avatar">;

export interface StructureNode {
  member: StructureMember;
  children: StructureNode[];
  descendantCount: number;
  rootReason: "top" | "unassigned" | "outside" | "cycle" | null;
}

const names = new Intl.Collator("de", { sensitivity: "base" });

function compareMembers(a: StructureMember, b: StructureMember): number {
  return Number(b.role === "LEADER") - Number(a.role === "LEADER")
    || Number(Boolean(b.active)) - Number(Boolean(a.active))
    || names.compare(a.name, b.name)
    || a.id - b.id;
}

/** Build only the visible forest; never infer or load people outside this list. */
export function buildTeamStructure(members: StructureMember[]): StructureNode[] {
  const nodes: StructureNode[] = [...members].sort(compareMembers).map((member) => ({
    member,
    children: [],
    descendantCount: 0,
    rootReason: null,
  }));
  const byId = new Map(nodes.map((node) => [node.member.id, node]));
  const parents = new Map<StructureNode, StructureNode>();

  for (const node of nodes) {
    if (node.member.manager_id === null) {
      node.rootReason = node.member.role === "LEADER" ? "top" : "unassigned";
      continue;
    }
    const parent = byId.get(node.member.manager_id);
    if (!parent || parent.member.team_id !== node.member.team_id) {
      node.rootReason = "outside";
      continue;
    }
    // Inactive managers remain part of the reporting structure.
    parents.set(node, parent);
  }

  const checked = new Set<StructureNode>();
  for (const start of nodes) {
    const path: StructureNode[] = [];
    const positions = new Map<StructureNode, number>();
    let current: StructureNode | undefined = start;
    while (current && !checked.has(current)) {
      const cycleAt = positions.get(current);
      if (cycleAt !== undefined) {
        // Break one edge in a stable place, preserving the cycle's other branches.
        const root = path.slice(cycleAt).sort((a, b) => compareMembers(a.member, b.member))[0];
        parents.delete(root);
        root.rootReason = "cycle";
        break;
      }
      positions.set(current, path.length);
      path.push(current);
      current = parents.get(current);
    }
    for (const node of path) checked.add(node);
  }

  const roots: StructureNode[] = [];
  for (const node of nodes) {
    const parent = parents.get(node);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Iterative traversal also handles very deep imported reporting structures.
  const traversal: StructureNode[] = [];
  const pending = [...roots];
  while (pending.length) {
    const node = pending.pop()!;
    traversal.push(node);
    for (const child of node.children) pending.push(child);
  }
  for (let index = traversal.length - 1; index >= 0; index--) {
    const node = traversal[index];
    const parent = parents.get(node);
    if (parent) parent.descendantCount += node.descendantCount + 1;
  }
  return roots;
}
