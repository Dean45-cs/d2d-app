import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { authenticate, hashPassword } from "../../src/lib/auth";
import { createInvitation, registerInvitation, decideInvitation, revokeInvitation, publicInvitation, setManager, invitationDashboard } from "../../src/lib/invitations";
import type { User } from "../../src/lib/types";

const dir = mkdtempSync(path.join(tmpdir(), "d2d-invitations-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
const db = getDb();
after(() => { db.close(); global.__d2dDb = undefined; rmSync(dir, { recursive: true, force: true }); });
const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Test')").run().lastInsertRowid);
const otherTeam = Number(db.prepare("INSERT INTO teams(name) VALUES ('Other')").run().lastInsertRowid);
function user(name: string, manager: number | null, role = "MEMBER", teamId = team) {
  return Number(db.prepare("INSERT INTO users(team_id, manager_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)")
    .run(teamId, manager, name, `${name}@test.de`, hashPassword("password123"), role).lastInsertRowid);
}
const root = user("root", null, "LEADER");
const manager = user("manager", root);
const inviter = user("inviter", manager);
const peer = user("peer", root, "LEADER");
const outsider = user("outsider", null, "LEADER", otherTeam);
const person = (id: number) => db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
const input = (email: string) => ({ name: "New Person", email, password: "password123", phone: "123" });
function requestByToken(token: string) {
  return db.prepare("SELECT r.id FROM join_requests r JOIN invitation_links l ON l.id = r.invitation_id WHERE l.token = ?").get(token) as { id: number };
}

test("registration grants no access; only the inviter's direct manager approves", () => {
  const { token } = createInvitation(inviter);
  assert.ok(publicInvitation(token));
  registerInvitation(token, { ...input("new@test.de"), role: "LEADER", team_id: otherTeam, manager_id: outsider });
  assert.equal(authenticate("new@test.de", "password123"), null);
  assert.equal(publicInvitation(token), undefined);
  assert.throws(() => registerInvitation(token, input("second@test.de")));
  const { id } = requestByToken(token);
  for (const unauthorized of [inviter, root, peer, outsider]) assert.throws(() => decideInvitation(unauthorized, id, "APPROVED"), /direkte Führungskraft/);
  assert.equal(invitationDashboard(person(manager)).approvals.length, 1);
  assert.equal(invitationDashboard(person(peer)).approvals.length, 0);
  decideInvitation(manager, id, "APPROVED");
  const created = authenticate("new@test.de", "password123")!;
  assert.ok(created);
  assert.equal(created.manager_id, inviter);
  assert.equal(created.team_id, team);
  assert.equal(created.role, "MEMBER");
  assert.throws(() => decideInvitation(manager, id, "APPROVED"), /bereits/);
  assert.equal((db.prepare("SELECT password_hash FROM join_requests WHERE id = ?").get(id) as { password_hash: null }).password_hash, null);
});

test("rejection, expiry, revocation and disabled inviters deny access", () => {
  const { token } = createInvitation(inviter);
  registerInvitation(token, input("rejected@test.de"));
  decideInvitation(manager, requestByToken(token).id, "REJECTED");
  assert.equal(authenticate("rejected@test.de", "password123"), null);
  for (const state of ["expired", "revoked", "disabled"]) {
    const link = createInvitation(inviter);
    const id = publicInvitation(link.token)!.id;
    if (state === "expired") db.prepare("UPDATE invitation_links SET expires_at = datetime('now', '-1 day') WHERE id = ?").run(id);
    if (state === "revoked") {
      assert.throws(() => revokeInvitation(peer, id));
      revokeInvitation(inviter, id);
    }
    if (state === "disabled") db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(inviter);
    assert.throws(() => registerInvitation(link.token, input(`${state}@test.de`)));
    db.prepare("UPDATE users SET active = 1 WHERE id = ?").run(inviter);
  }
});

test("structure rejects cycles, other teams and unassigned members; follows current manager", () => {
  assert.throws(() => setManager(team, manager, inviter), /Kreis/);
  assert.throws(() => setManager(team, inviter, inviter), /Kreis/);
  assert.throws(() => setManager(team, inviter, outsider), /selben Team/);
  assert.throws(() => setManager(team, inviter, null));
  const unassigned = user("unassigned", null);
  assert.throws(() => createInvitation(unassigned), /zuordnen/);
  const { token } = createInvitation(inviter);
  registerInvitation(token, input("moved@test.de"));
  setManager(team, inviter, peer);
  assert.throws(() => decideInvitation(manager, requestByToken(token).id, "APPROVED"));
  decideInvitation(peer, requestByToken(token).id, "APPROVED");
  setManager(team, inviter, manager);
});

test("root approval, duplicate email and invalid input", () => {
  const { token } = createInvitation(root);
  assert.throws(() => registerInvitation(token, { ...input("bad"), password: "short" }));
  registerInvitation(token, input("root-invite@test.de"));
  const second = createInvitation(root);
  assert.throws(() => registerInvitation(second.token, input("ROOT-INVITE@test.de")), /bereits/);
  decideInvitation(root, requestByToken(token).id, "APPROVED");
  assert.equal(authenticate("root-invite@test.de", "password123")!.manager_id, root);
  assert.throws(() => registerInvitation(second.token, input("ROOT-INVITE@test.de")), /bereits/);
  assert.equal(publicInvitation("bad-token"), null);
});

test("approval rolls back when an email was taken after registration", () => {
  const { token } = createInvitation(inviter);
  registerInvitation(token, input("collision@test.de"));
  user("collision", root);
  const { id } = requestByToken(token);
  assert.throws(() => decideInvitation(manager, id, "APPROVED"), /vergeben/);
  assert.equal((db.prepare("SELECT status FROM join_requests WHERE id = ?").get(id) as { status: string }).status, "PENDING");
  decideInvitation(manager, id, "REJECTED");
});
