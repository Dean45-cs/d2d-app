import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { authenticate, hashPassword } from "../../src/lib/auth";
import { createInvitation, registerInvitation, decideInvitation, revokeInvitation, publicInvitation, setManager, setTier, placementManager, invitationDashboard } from "../../src/lib/invitations";
import type { User } from "../../src/lib/types";

const dir = mkdtempSync(path.join(tmpdir(), "d2d-invitations-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
const db = getDb();
after(() => { db.close(); global.__d2dDb = undefined; rmSync(dir, { recursive: true, force: true }); });
const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Test')").run().lastInsertRowid);
const otherTeam = Number(db.prepare("INSERT INTO teams(name) VALUES ('Other')").run().lastInsertRowid);
function user(name: string, manager: number | null, role = "MEMBER", teamId = team, tier = "BERATER") {
  return Number(db.prepare("INSERT INTO users(team_id, manager_id, name, email, password_hash, role, tier) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(teamId, manager, name, `${name}@test.de`, hashPassword("password123"), role, tier).lastInsertRowid);
}
// root (Geschaeftsfuehrung) -> manager (Teamleiter) -> inviter (Berater)
const root = user("root", null, "LEADER");
const manager = user("manager", root, "MEMBER", team, "TEAMLEITER");
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
  // Ein Berater baut kein eigenes Team auf: die neue Person kommt zu seinem Teamleiter.
  assert.equal(created.manager_id, manager);
  assert.equal(created.tier, "BERATER");
  assert.equal(invitationDashboard(person(inviter)).placement, "manager");
  assert.equal(invitationDashboard(person(inviter)).reports.length, 0);
  // Wer sie mitgebracht hat, bleibt an der Einladung vermerkt.
  assert.deepEqual(db.prepare(`SELECT l.inviter_id FROM join_requests r JOIN invitation_links l ON l.id = r.invitation_id WHERE r.user_id = ?`).get(created.id), { inviter_id: inviter });
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

test("a team of one's own starts at Teamleiter: placement, reporting lines and demotion", () => {
  // Ein Teamleiter bekommt die Person selbst - freigegeben von seiner Fuehrungskraft.
  const lead = createInvitation(manager);
  registerInvitation(lead.token, input("lead-invite@test.de"));
  decideInvitation(root, requestByToken(lead.token).id, "APPROVED");
  const recruit = authenticate("lead-invite@test.de", "password123")!;
  assert.equal(recruit.manager_id, manager);
  assert.equal(invitationDashboard(person(manager)).placement, null);
  // Direkt unter der Geschaeftsfuehrung: ein Berater bringt die Person zur Geschaeftsfuehrung.
  const solo = user("solo", root);
  assert.equal(placementManager(person(solo)).id, root);
  // Niemand wird einem Berater oder Senior Berater unterstellt.
  assert.throws(() => setManager(team, solo, inviter), /erst ab Teamleiter/);
  setTier(team, inviter, "SENIOR");
  assert.throws(() => setManager(team, solo, inviter), /erst ab Teamleiter/);
  assert.equal(placementManager(person(inviter)).id, manager);
  // Mit der Stufe Teamleiter geht beides - und Einladungen landen bei ihm selbst.
  setTier(team, inviter, "TEAMLEITER");
  setManager(team, solo, inviter);
  assert.equal(placementManager(person(inviter)).id, inviter);
  // Solange jemand unter ihm steht, bleibt er Teamleiter.
  assert.throws(() => setTier(team, inviter, "BERATER"), /eine Person unter sich/);
  assert.throws(() => setTier(team, manager, "SENIOR"), /Personen unter sich/);
  setManager(team, solo, root);
  setTier(team, inviter, "BERATER");
  assert.equal(person(inviter).tier, "BERATER");
  // Ungueltiges: unbekannte Stufe, fremdes Team, Geschaeftsfuehrung.
  assert.throws(() => setTier(team, inviter, "CHEF"), /Unbekannte Stufe/);
  assert.throws(() => setTier(otherTeam, inviter, "SENIOR"), /nicht gefunden/);
  assert.throws(() => setTier(team, root, "TEAMLEITER"), /keine Stufe/);
});

test("placement skips inactive or ineligible managers and never leaves the team", () => {
  // Altbestand: jemand steht unter einem Berater - die neue Person geht zur naechsten Fuehrungskraft darueber.
  const loose = user("loose", inviter);
  assert.equal(placementManager(person(loose)).id, manager);
  // Ist der Teamleiter deaktiviert, uebernimmt die Geschaeftsfuehrung.
  db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(manager);
  assert.equal(placementManager(person(inviter)).id, root);
  db.prepare("UPDATE users SET active = 1 WHERE id = ?").run(manager);
  // Ohne Fuehrungskraft oder im Kreis gibt es keinen Platz - und keine Endlosschleife.
  const a = user("loop-a", null);
  const b = user("loop-b", a);
  db.prepare("UPDATE users SET manager_id = ? WHERE id = ?").run(b, a);
  assert.throws(() => placementManager(person(a)), /keine aktive Führungskraft/);
  assert.throws(() => createInvitation(a));
  db.prepare("UPDATE users SET manager_id = ? WHERE id IN (?, ?, ?)").run(root, a, b, loose);
});
