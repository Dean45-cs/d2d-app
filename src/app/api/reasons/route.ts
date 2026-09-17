import { requireRole } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { handle, optionalText, requireText } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requireRole("LEADER");
    const body = await request.json();
    const label = requireText(body.label, "Bezeichnung", 80);

    const db = getDb();
    const max = db
      .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM rejection_reasons WHERE team_id = ?")
      .get(leader.team_id) as { m: number };

    const code =
      optionalText(body.code, 40).toUpperCase() ||
      label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 30) + "_" + (max.m + 1);

    db.prepare(
      `INSERT INTO rejection_reasons (team_id, code, label, emoji, hint, sort_order, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      leader.team_id,
      code,
      label,
      optionalText(body.emoji, 8) || "💬",
      optionalText(body.hint, 120),
      max.m + 1,
    );
    return { ok: true };
  });
}
