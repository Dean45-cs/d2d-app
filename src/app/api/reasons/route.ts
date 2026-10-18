import { requirePermission } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { handle, optionalText, requireText } from "@/lib/api";
import { reasonCode } from "@/lib/queries";
import { DEFAULT_REASON_ICON, isReasonIcon } from "@/lib/reason-icons";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requirePermission("settings.reasons");
    const body = await request.json();
    const label = requireText(body.label, "Bezeichnung", 80);

    const db = getDb();
    const max = db
      .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM rejection_reasons WHERE team_id = ?")
      .get(leader.team_id) as { m: number };

    const code = reasonCode(leader.team_id, label, optionalText(body.code, 40), max.m + 1);

    db.prepare(
      `INSERT INTO rejection_reasons (team_id, code, label, icon, hint, sort_order, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      leader.team_id,
      code,
      label,
      isReasonIcon(body.icon) ? body.icon : DEFAULT_REASON_ICON,
      optionalText(body.hint, 120),
      max.m + 1,
    );
    return { ok: true };
  });
}
