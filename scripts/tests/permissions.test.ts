import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { getDb } from "../../src/lib/db";
import { AuthError } from "../../src/lib/auth";
import { PERMISSIONS } from "../../src/lib/permission-definitions";
import { assertStreetAccess, canAccessTerritory, canManageMember, hasPermission, permissionsFor, structureIds, territoryAssignee, updatePermissions } from "../../src/lib/permissions";
import { createTerritories, createTerritory, listAccessibleTerritories, reasonStats } from "../../src/lib/queries";
import { createInvitation, decideInvitation, registerInvitation } from "../../src/lib/invitations";
import { navigation } from "../../src/lib/nav";
import type { Territory, User } from "../../src/lib/types";

const dir = mkdtempSync(path.join(tmpdir(), "d2d-permissions-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
let db = getDb();
after(() => { db.close(); global.__d2dDb = undefined; rmSync(dir, { recursive: true, force: true }); });
let sequence = 0;
const person = (id: number) => db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
function fixture() {
  const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Permissions')").run().lastInsertRowid);
  const otherTeam = Number(db.prepare("INSERT INTO teams(name) VALUES ('Other')").run().lastInsertRowid);
  function add(manager: number | null, role = "MEMBER", teamId = team) {
    const name = `permission-${++sequence}`;
    return Number(db.prepare("INSERT INTO users(team_id, manager_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, '', ?)").run(teamId, manager, name, `${name}@test.de`, role).lastInsertRowid);
  }
  const root = add(null, "LEADER");
  const manager = add(root);
  const child = add(manager);
  const peer = add(root);
  const outsider = add(null, "LEADER", otherTeam);
  const territory = (creator: number | undefined, assignee: number | null = null, teamId = team) => {
    const id = createTerritory({ teamId, name: "Testgebiet", city: "", postalCode: "", assignedUserId: assignee, createdBy: creator, note: "", dueDate: null });
    return db.prepare("SELECT * FROM territories WHERE id = ?").get(id) as Territory;
  };
  return { team, otherTeam, root, manager, child, peer, outsider, add, territory };
}
const forbidden = (fn: () => unknown) => assert.throws(fn, (error: unknown) => error instanceof AuthError && error.status === 403);

test("leaders retain defaults; an active person in the structure unlocks territory creation and delegation", () => {
  const f = fixture();
  assert.ok(PERMISSIONS.every(({ key }) => hasPermission(person(f.root), key)));
  assert.equal(hasPermission(person(f.child), "territories.create"), false);
  assert.equal(hasPermission(person(f.manager), "territories.create"), true);
  assert.equal(hasPermission(person(f.manager), "permissions.manage"), true);
  assert.equal(hasPermission(person(f.manager), "energy.manage"), false);
  db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(f.child);
  assert.equal(hasPermission(person(f.manager), "territories.create"), false);
  const grandchild = f.add(f.child);
  assert.deepEqual(new Set(structureIds(person(f.manager))), new Set([f.child, grandchild]));
  assert.equal(hasPermission(person(f.manager), "territories.create"), true);
  db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(f.manager);
  assert.ok(PERMISSIONS.every(({ key }) => !hasPermission(person(f.manager), key)));
});

test("explicit creation grants work without reports; denials override automatic rights and reset follows current structure", () => {
  const f = fixture();
  updatePermissions(person(f.root), f.child, { "territories.create": true });
  assert.equal(hasPermission(person(f.child), "territories.create"), true);
  assert.equal(hasPermission(person(f.child), "territories.edit"), true);
  updatePermissions(person(f.root), f.child, { "territories.edit": false });
  assert.equal(hasPermission(person(f.child), "territories.edit"), false);
  updatePermissions(person(f.root), f.manager, { "territories.create": false });
  assert.equal(hasPermission(person(f.manager), "territories.create"), false);
  assert.equal(hasPermission(person(f.manager), "territories.assign"), false);
  updatePermissions(person(f.root), f.manager, { "territories.create": null });
  assert.equal(hasPermission(person(f.manager), "territories.create"), true);
  updatePermissions(person(f.root), f.child, { "territories.create": null, "territories.edit": null });
  assert.equal(hasPermission(person(f.child), "territories.create"), false);
});

test("delegation is limited to one's own structure and rights, denies self edits and applies atomically", () => {
  const f = fixture();
  const manager = person(f.manager);
  updatePermissions(manager, f.child, { "territories.create": true });
  for (const id of [f.manager, f.root, f.peer]) forbidden(() => updatePermissions(manager, id, { "territories.create": true }));
  assert.throws(() => updatePermissions(manager, f.outsider, { "territories.create": true }), /nicht gefunden/);
  forbidden(() => updatePermissions(manager, f.child, { "energy.manage": true }));
  assert.throws(() => updatePermissions(person(f.root), f.peer, { "territories.create": true, unknown: true }));
  assert.equal(hasPermission(person(f.peer), "territories.create"), false);
  assert.throws(() => updatePermissions(person(f.root), f.peer, { "territories.create": "yes" }));
  assert.throws(() => updatePermissions(person(f.root), f.peer, []));
  updatePermissions(person(f.root), f.manager, { "permissions.manage": false });
  forbidden(() => updatePermissions(manager, f.child, { "territories.create": false }));
});

test("granting creation cannot indirectly restore editing or deletion rights the actor lacks", () => {
  const f = fixture();
  updatePermissions(person(f.root), f.manager, { "territories.delete": false });
  forbidden(() => updatePermissions(person(f.manager), f.child, { "territories.create": true }));
  assert.equal(hasPermission(person(f.child), "territories.create"), false);
  updatePermissions(person(f.root), f.child, { "territories.delete": false });
  updatePermissions(person(f.manager), f.child, { "territories.create": true });
  assert.equal(hasPermission(person(f.child), "territories.create"), true);
  assert.equal(hasPermission(person(f.child), "territories.delete"), false);
});

test("territory access covers assignment and authorship, stays within the team and rejects guessed street IDs", () => {
  const f = fixture();
  const own = f.territory(f.manager, f.child);
  const assigned = f.territory(f.root, f.manager);
  const peers = f.territory(f.peer, f.peer);
  const foreign = f.territory(f.outsider, f.outsider, f.otherTeam);
  assert.deepEqual(new Set(listAccessibleTerritories(person(f.manager)).map((row) => row.id)), new Set([own.id, assigned.id]));
  assert.equal(canAccessTerritory(person(f.child), own), true);
  assert.equal(canAccessTerritory(person(f.manager), peers), false);
  assert.equal(canAccessTerritory(person(f.root), foreign), false);
  const street = Number(db.prepare("INSERT INTO streets(territory_id, name) VALUES (?, 'Geheim')").run(peers.id).lastInsertRowid);
  forbidden(() => assertStreetAccess(person(f.manager), street));
  updatePermissions(person(f.root), f.manager, { "territories.view_all": true });
  assertStreetAccess(person(f.manager), street);
  assert.equal(canAccessTerritory(person(f.manager), foreign), false);
});

test("assignment rejects foreign teams, peers, disabled people and malformed IDs; no assignment grant creates for self", () => {
  const f = fixture();
  assert.equal(territoryAssignee(person(f.manager), f.child), f.child);
  forbidden(() => territoryAssignee(person(f.manager), f.peer));
  assert.throws(() => territoryAssignee(person(f.root), f.outsider));
  for (const id of ["bad", 0, -1, 1.5]) assert.throws(() => territoryAssignee(person(f.root), id));
  db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(f.child);
  assert.throws(() => territoryAssignee(person(f.manager), f.child));
  updatePermissions(person(f.root), f.peer, { "territories.create": true, "territories.assign": false });
  assert.equal(territoryAssignee(person(f.peer), null, true), f.peer);
  forbidden(() => territoryAssignee(person(f.peer), f.root, true));
  forbidden(() => territoryAssignee(person(f.peer), null));
});

test("split territories preserve authorship and stay accessible after assigning them to someone else", () => {
  const f = fixture();
  const ids = createTerritories(f.team, ["A", "B"].map((name) => ({ name, city: "", postalCode: "", assignedUserId: f.child, note: "", dueDate: null, areaJson: "", streets: [] })), f.manager);
  assert.deepEqual(new Set(listAccessibleTerritories(person(f.manager)).map((row) => row.id)), new Set(ids));
  assert.ok(ids.every((id) => (db.prepare("SELECT created_by FROM territories WHERE id = ?").get(id) as { created_by: number }).created_by === f.manager));
});

test("team-wide view grants do not expand member administration scope or enable role escalation", () => {
  const f = fixture();
  updatePermissions(person(f.root), f.manager, { "territories.view_all": true, "team.manage": true, "team.roles": true });
  assert.equal(canManageMember(person(f.manager), person(f.child)), true);
  assert.equal(canManageMember(person(f.manager), person(f.peer)), false);
  assert.equal(canManageMember(person(f.manager), person(f.root)), false);
  assert.equal(hasPermission(person(f.manager), "team.roles"), false);
  forbidden(() => updatePermissions(person(f.manager), f.child, { "team.roles": true }));
});

test("navigation reflects grants and denials without empty or undefined mobile tabs", () => {
  const f = fixture();
  const initial = navigation("MEMBER", permissionsFor(person(f.manager)));
  assert.ok(initial.items.some((item) => item.href === "/einstellungen/rechte"));
  assert.ok(!initial.items.some((item) => item.href === "/einstellungen/mitglieder"));
  updatePermissions(person(f.root), f.manager, { "team.manage": true, "energy.reference": true, "reports.team": true });
  const granted = navigation("MEMBER", permissionsFor(person(f.manager)));
  for (const href of ["/einstellungen/mitglieder", "/einstellungen/energie", "/start"]) assert.ok(granted.items.some((item) => item.href === href));
  assert.ok(granted.tabs.some((item) => item.href === "/start"));
  db.prepare("INSERT INTO user_permissions(user_id, permission, allowed) VALUES (?, 'reports.team', 0)").run(f.root);
  const denied = navigation("LEADER", permissionsFor(person(f.root)));
  assert.ok(!denied.tabs.some((item) => item.href === "/start"));
  assert.equal(denied.tabs[0].href, "/tour");
  assert.ok(denied.tabs.every(Boolean));
  assert.ok(denied.tabs.length <= 5);
});

test("invitation permissions revoke creation and approval without transferring approval to other managers", () => {
  const f = fixture();
  const link = createInvitation(f.child);
  registerInvitation(link.token, { name: "New", email: `join-${++sequence}@test.de`, password: "test-password-123" });
  const request = db.prepare("SELECT id FROM join_requests WHERE invitation_id = (SELECT id FROM invitation_links WHERE token = ?)").get(link.token) as { id: number };
  updatePermissions(person(f.root), f.manager, { "invitations.approve": false });
  forbidden(() => decideInvitation(f.manager, request.id, "APPROVED"));
  assert.equal((db.prepare("SELECT status FROM join_requests WHERE id = ?").get(request.id) as { status: string }).status, "PENDING");
  updatePermissions(person(f.root), f.child, { "invitations.create": false });
  forbidden(() => createInvitation(f.child));
  updatePermissions(person(f.root), f.manager, { "invitations.approve": null });
  decideInvitation(f.manager, request.id, "APPROVED");
});

test("personal rejection reports do not count other members or teams", () => {
  const f = fixture();
  const reason = Number(db.prepare("INSERT INTO rejection_reasons(team_id, code, label) VALUES (?, 'test', 'Test')").run(f.team).lastInsertRowid);
  for (const [user, team] of [[f.manager, f.team], [f.child, f.team], [f.outsider, f.otherTeam]]) db.prepare("INSERT INTO visits(team_id, user_id, outcome, reason_id) VALUES (?, ?, 'MET_NO_SALE', ?)").run(team, user, reason);
  assert.equal(reasonStats(f.team)[0].count, 2);
  assert.equal(reasonStats(f.team, undefined, f.manager)[0].count, 1);
});

test("database upgrade preserves old assignments and role defaults, and new overrides survive reopening", () => {
  const existingPath = process.env.DATABASE_PATH!;
  db.close(); global.__d2dDb = undefined;
  const legacyPath = path.join(dir, "legacy.db");
  const legacy = new Database(legacyPath);
  legacy.exec(`CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
    INSERT INTO teams VALUES(1, 'Legacy', datetime('now'));
    CREATE TABLE users(id INTEGER PRIMARY KEY, team_id INTEGER, name TEXT, email TEXT UNIQUE, password_hash TEXT, role TEXT, phone TEXT, active INTEGER DEFAULT 1, created_at TEXT);
    INSERT INTO users VALUES(1, 1, 'Leader', 'legacy@test.de', '', 'LEADER', NULL, 1, datetime('now'));
    INSERT INTO users VALUES(2, 1, 'Member', 'legacy-member@test.de', '', 'MEMBER', NULL, 1, datetime('now'));
    CREATE TABLE territories(id INTEGER PRIMARY KEY, team_id INTEGER, name TEXT, city TEXT DEFAULT '', postal_code TEXT DEFAULT '', assigned_user_id INTEGER, status TEXT DEFAULT 'OPEN', note TEXT DEFAULT '', due_date TEXT, created_at TEXT);
    INSERT INTO territories(id, team_id, name, assigned_user_id) VALUES(1, 1, 'Existing', 2);`);
  legacy.close(); process.env.DATABASE_PATH = legacyPath;
  db = getDb();
  assert.equal(person(2).manager_id, 1);
  assert.ok(PERMISSIONS.every(({ key }) => hasPermission(person(1), key)));
  const territory = db.prepare("SELECT * FROM territories WHERE id = 1").get() as Territory;
  assert.equal(territory.assigned_user_id, 2);
  assert.equal(territory.created_by, null);
  assert.equal(canAccessTerritory(person(2), territory), true);
  updatePermissions(person(1), 2, { "energy.manage": true });
  db.close(); global.__d2dDb = undefined; db = getDb();
  assert.equal(hasPermission(person(2), "energy.manage"), true);
  db.close(); global.__d2dDb = undefined; process.env.DATABASE_PATH = existingPath; db = getDb();
});
