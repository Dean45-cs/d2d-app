import { hashPassword, requireRole } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { handle, optionalText } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const leader = await requireRole("LEADER");
    const { id } = await params;
    const userId = Number(id);

    const member = getDb()
      .prepare("SELECT id, role FROM users WHERE id = ? AND team_id = ?")
      .get(userId, leader.team_id) as { id: number; role: string } | undefined;
    if (!member) throw new Error("Mitarbeiter nicht gefunden.");

    const body = await request.json();
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
