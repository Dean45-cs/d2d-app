import { AuthError, hashPassword, requireUser } from "@/lib/auth";
import { assertMemberScope, assertPermission, structureIds } from "@/lib/permissions";
import type { User } from "@/lib/types";
import { getDb } from "@/lib/db";
import { handle, optionalAvatar, optionalText } from "@/lib/api";
import { setManager } from "@/lib/invitations";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const leader = await requireUser();
    const { id } = await params;
    const userId = Number(id);

    const member = getDb()
      .prepare("SELECT * FROM users WHERE id = ? AND team_id = ?")
      .get(userId, leader.team_id) as User | undefined;
    if (!member) throw new Error("Mitarbeiter nicht gefunden.");

    const body = await request.json();
    assertMemberScope(leader, member);
    if (body.manager_id !== undefined) {
      assertPermission(leader, "structure.manage");
      if (Object.keys(body).length !== 1) throw new Error("Bitte die Struktur separat ändern.");
      if (body.manager_id !== null && (!Number.isSafeInteger(body.manager_id) || body.manager_id < 1)) {
        throw new Error("Ungültige Führungskraft.");
      }
      if (leader.role !== "LEADER" && body.manager_id !== leader.id && !structureIds(leader).includes(body.manager_id)) {
        throw new AuthError("Die Führungskraft muss zu deiner eigenen Struktur gehören.", 403);
      }
      setManager(leader.team_id, userId, body.manager_id);
      return { ok: true };
    }
    if (Object.keys(body).some((key) => key !== "role")) assertPermission(leader, "team.manage");
    if (body.role !== undefined) {
      assertPermission(leader, "team.roles");
      if (leader.role !== "LEADER") throw new AuthError("Nur Teamleitungen können Rollen ändern.", 403);
      if (!["LEADER", "MEMBER"].includes(body.role)) throw new Error("Unbekannte Rolle.");
      if (body.role === "MEMBER" && member.manager_id === null) throw new Error("Bitte zuerst eine direkte Führungskraft zuordnen.");
    }
    const db = getDb();
    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (body.name !== undefined) {
      fields.push("name = ?");
      values.push(optionalText(body.name, 120));
    }
    if (body.phone !== undefined) {
      fields.push("phone = ?");
      values.push(optionalText(body.phone, 40));
    }
    if (body.avatar !== undefined) {
      // Leerer Wert nimmt das Bild wieder weg.
      fields.push("avatar = ?");
      values.push(optionalAvatar(body.avatar));
    }
    if (body.active !== undefined) {
      if (userId === leader.id && !body.active) {
        throw new Error("Du kannst dich nicht selbst deaktivieren.");
      }
      fields.push("active = ?");
      values.push(body.active ? 1 : 0);
    }
    if (body.role !== undefined) {
      if (userId === leader.id && body.role !== "LEADER") {
        throw new Error("Du kannst dir die Teamleitung nicht selbst entziehen.");
      }
      fields.push("role = ?");
      values.push(body.role === "LEADER" ? "LEADER" : "MEMBER");
    }
    if (body.password) {
      const password = String(body.password);
      if (password.length < 8) throw new Error("Das Passwort braucht mindestens 8 Zeichen.");
      fields.push("password_hash = ?");
      values.push(hashPassword(password));
    }

    if (fields.length === 0) return { ok: true };
    values.push(userId);
    db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return { ok: true };
  });
}
