import { AuthError, hashPassword } from "@/lib/auth";
import { assertPermission, requirePermission } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { handle, optionalAvatar, optionalText, requireText } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requirePermission("team.manage");
    const body = await request.json();

    const email = requireText(body.email, "E-Mail", 190).toLowerCase();
    const password = String(body.password ?? "");
    if (password.length < 8) {
      throw new Error("Das Passwort braucht mindestens 8 Zeichen.");
    }
    const role = body.role === "LEADER" ? "LEADER" : "MEMBER";
    if (role === "LEADER") {
      assertPermission(leader, "team.roles");
      if (leader.role !== "LEADER") throw new AuthError("Nur Teamleitungen können Teamleitungen ernennen.", 403);
    }

    const exists = getDb()
      .prepare("SELECT id FROM users WHERE lower(email) = ?")
      .get(email);
    if (exists) throw new Error("Diese E-Mail ist schon vergeben.");

    const id = getDb()
      .prepare(
        `INSERT INTO users (team_id, name, email, password_hash, role, phone, avatar, manager_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        leader.team_id,
        requireText(body.name, "Name", 120),
        email,
        hashPassword(password),
        role,
        optionalText(body.phone, 40),
        optionalAvatar(body.avatar),
        leader.id,
      ).lastInsertRowid as number;

    return { ok: true, id };
  });
}
