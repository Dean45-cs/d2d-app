import { assertPermission, hasPermission } from "./permissions";
import crypto from "node:crypto";
import { getDb } from "./db";
import { AuthError, hashPassword } from "./auth";
import type { User } from "./types";

function activeUser(id: number) {
  const user = getDb().prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(id) as User | undefined;
  if (!user) throw new Error("Dieses Mitglied ist nicht mehr aktiv.");
  return user;
}

export function invitationApprover(inviter: User): User {
  if (inviter.manager_id === null) {
    if (inviter.role === "LEADER") return inviter;
    throw new Error("Bitte lass dir zuerst von der Teamleitung eine direkte Führungskraft zuordnen.");
  }
  const manager = getDb().prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(inviter.manager_id) as User | undefined;
  if (!manager) throw new Error("Deine Führungskraft ist nicht mehr aktiv. Bitte die Teamleitung, dir eine neue zuzuordnen.");
  if (manager.team_id !== inviter.team_id || manager.id === inviter.id) {
    throw new Error("Die Zuordnung in der Struktur ist ungültig.");
  }
  return manager;
}

export function createInvitation(actorId: number) {
  const inviter = activeUser(actorId);
  assertPermission(inviter, "invitations.create");
  invitationApprover(inviter);
  const db = getDb();
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM invitation_links l
    WHERE inviter_id = ? AND revoked_at IS NULL AND expires_at > datetime('now')
    AND NOT EXISTS (SELECT 1 FROM join_requests r WHERE r.invitation_id = l.id)`).get(actorId) as { count: number };
  if (count >= 20) throw new Error("Du hast bereits 20 offene Links. Widerrufe zuerst einen alten Link.");
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO invitation_links (token, inviter_id) VALUES (?, ?)").run(token, inviter.id);
  return { token };
}

export function publicInvitation(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return getDb().prepare(`SELECT l.id, l.inviter_id, u.name AS inviter_name, t.name AS team_name
    FROM invitation_links l JOIN users u ON u.id = l.inviter_id JOIN teams t ON t.id = u.team_id
    WHERE l.token = ? AND l.revoked_at IS NULL AND l.expires_at > datetime('now') AND u.active = 1
    AND (u.manager_id IS NULL AND u.role = 'LEADER' OR EXISTS (
      SELECT 1 FROM users m WHERE m.id = u.manager_id AND m.active = 1 AND m.team_id = u.team_id
    )) AND NOT EXISTS (SELECT 1 FROM join_requests r WHERE r.invitation_id = l.id)`).get(token) as
    { id: number; inviter_id: number; inviter_name: string; team_name: string } | undefined;
}

export function registerInvitation(token: string, input: Record<string, unknown>) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (!name || name.length > 120) throw new Error("Bitte einen Namen mit höchstens 120 Zeichen eingeben.");
  if (email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Bitte eine gültige E-Mail eingeben.");
  if (password.length < 8 || password.length > 128) throw new Error("Das Passwort braucht 8 bis 128 Zeichen.");
  if (phone.length > 40) throw new Error("Die Telefonnummer ist zu lang.");
  const db = getDb();
  return db.transaction(() => {
    const link = publicInvitation(token);
    if (!link) throw new Error("Dieser Link ist abgelaufen, widerrufen oder bereits verwendet.");
    if (db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email) ||
        db.prepare("SELECT id FROM join_requests WHERE lower(email) = ? AND status = 'PENDING'").get(email)) {
      throw new Error("Für diese E-Mail gibt es bereits ein Konto oder eine offene Anfrage.");
    }
    db.prepare(`INSERT INTO join_requests (invitation_id, name, email, phone, password_hash)
      VALUES (?, ?, ?, ?, ?)`).run(link.id, name, email, phone, hashPassword(password));
    return { ok: true };
  }).immediate();
}

export function decideInvitation(actorId: number, requestId: number, decision: "APPROVED" | "REJECTED") {
  const db = getDb();
  return db.transaction(() => {
    const actor = activeUser(actorId);
    const request = db.prepare(`SELECT r.*, l.inviter_id FROM join_requests r
      JOIN invitation_links l ON l.id = r.invitation_id WHERE r.id = ?`).get(requestId) as
      { id: number; inviter_id: number; status: string; name: string; email: string; phone: string; password_hash: string } | undefined;
    if (!request) throw new Error("Anfrage nicht gefunden.");
    const inviter = activeUser(request.inviter_id);
    const byLeader = actor.role === "LEADER" && approverInactive(inviter);
    if (actor.team_id !== inviter.team_id || (!byLeader && invitationApprover(inviter).id !== actor.id)) {
      throw new AuthError("Nur die direkte Führungskraft des Einladenden darf diese Anfrage bearbeiten.", 403);
    }
    assertPermission(actor, "invitations.approve");
    if (request.status !== "PENDING") throw new Error("Diese Anfrage wurde bereits bearbeitet.");
    let userId: number | null = null;
    if (decision === "APPROVED") {
      if (db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(request.email)) {
        throw new Error("Diese E-Mail ist inzwischen vergeben. Bitte die Anfrage ablehnen.");
      }
      userId = Number(db.prepare(`INSERT INTO users (team_id, manager_id, name, email, phone, password_hash, role)
        VALUES (?, ?, ?, ?, ?, ?, 'MEMBER')`).run(inviter.team_id, inviter.id, request.name,
          request.email, request.phone, request.password_hash).lastInsertRowid);
    }
    db.prepare(`UPDATE join_requests SET status = ?, decided_at = datetime('now'), decided_by = ?,
      user_id = ?, password_hash = NULL WHERE id = ?`).run(decision, actor.id, userId, request.id);
    return { ok: true };
  }).immediate();
}

/**
 * Ist die Fuehrungskraft des Einladenden deaktiviert, kann sie offene
 * Beitritte nicht mehr bearbeiten - dann entscheidet die Teamleitung, statt
 * dass die Anfrage haengen bleibt und die E-Mail blockiert.
 */
function approverInactive(inviter: User): boolean {
  if (inviter.manager_id === null) return false;
  return !getDb().prepare("SELECT 1 FROM users WHERE id = ? AND active = 1").get(inviter.manager_id);
}

/**
 * Offene Beitritte ueber die Links einer deaktivierten Person kann niemand
 * mehr freigeben - und solange sie offen sind, blockieren sie die E-Mail fuer
 * jede neue Einladung. Beim Deaktivieren werden sie deshalb abgelehnt.
 */
export function rejectPendingJoins(actorId: number, inviterId: number): number {
  return getDb().prepare(`UPDATE join_requests SET status = 'REJECTED', decided_at = datetime('now'),
      decided_by = ?, password_hash = NULL
    WHERE status = 'PENDING'
      AND invitation_id IN (SELECT id FROM invitation_links WHERE inviter_id = ?)`)
    .run(actorId, inviterId).changes;
}

export function revokeInvitation(actorId: number, linkId: number) {
  const result = getDb().prepare(`UPDATE invitation_links SET revoked_at = datetime('now')
    WHERE id = ? AND inviter_id = ? AND revoked_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM join_requests WHERE invitation_id = invitation_links.id)`)
    .run(linkId, actorId);
  if (!result.changes) throw new Error("Dieser Link kann nicht widerrufen werden.");
  return { ok: true };
}

export function setManager(teamId: number, userId: number, managerId: number | null) {
  const db = getDb();
  const member = db.prepare("SELECT * FROM users WHERE id = ? AND team_id = ?").get(userId, teamId) as User | undefined;
  if (!member) throw new Error("Mitglied nicht gefunden.");
  if (managerId === null && member.role !== "LEADER") throw new Error("Vertriebsmitglieder brauchen eine direkte Führungskraft.");
  if (managerId !== null) {
    const manager = activeUser(managerId);
    if (manager.team_id !== teamId) throw new Error("Die Führungskraft muss zum selben Team gehören.");
    const cycle = db.prepare(`WITH RECURSIVE descendants(id) AS (
      SELECT id FROM users WHERE id = ? UNION SELECT u.id FROM users u JOIN descendants d ON u.manager_id = d.id
    ) SELECT id FROM descendants WHERE id = ?`).get(userId, managerId);
    if (cycle) throw new Error("Diese Zuordnung würde einen Kreis in der Struktur erzeugen.");
  }
  db.prepare("UPDATE users SET manager_id = ? WHERE id = ?").run(managerId, userId);
}

export interface InvitationRow {
  id: number; token: string; expires_at: string; revoked_at: string | null;
  request_id: number | null; name: string | null; email: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | null; inviter_id: number; inviter_name: string;
}

export function invitationDashboard(user: User) {
  const db = getDb();
  const select = `SELECT l.id, l.token, l.expires_at, l.revoked_at, l.inviter_id,
    u.name AS inviter_name, r.id AS request_id, r.name, r.email, r.status
    FROM invitation_links l JOIN users u ON u.id = l.inviter_id
    LEFT JOIN join_requests r ON r.invitation_id = l.id`;
  const own = db.prepare(`${select} WHERE l.inviter_id = ? ORDER BY l.id DESC LIMIT 100`).all(user.id) as InvitationRow[];
  const approvals = db.prepare(`${select} WHERE u.team_id = ? AND u.active = 1 AND r.status = 'PENDING'
    AND (u.manager_id = ? OR (u.id = ? AND u.manager_id IS NULL AND u.role = 'LEADER')
      OR (? = 'LEADER' AND EXISTS (SELECT 1 FROM users m WHERE m.id = u.manager_id AND m.active = 0)))
    ORDER BY r.id`).all(user.team_id, user.id, user.id, user.role) as InvitationRow[];
  let approver: string | null = null;
  let problem: string | null = null;
  try { approver = invitationApprover(user).name; }
  catch (error) { problem = (error as Error).message; }
  const reports = db.prepare("SELECT id, name FROM users WHERE manager_id = ? AND team_id = ? AND active = 1 ORDER BY name")
    .all(user.id, user.team_id) as { id: number; name: string }[];
  return { own, approvals: hasPermission(user, "invitations.approve") ? approvals : [], approver, problem, reports, canCreate: hasPermission(user, "invitations.create") };
}
