import { requireRole } from "@/lib/auth";
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
    const db = getDb();
    const reason = db
      .prepare("SELECT id FROM rejection_reasons WHERE id = ? AND team_id = ?")
      .get(Number(id), leader.team_id);
    if (!reason) throw new Error("Grund nicht gefunden.");

    const body = await request.json();
    const fields: string[] = [];
    const values: (string | number)[] = [];
    if (body.label !== undefined) {
      fields.push("label = ?");
      values.push(optionalText(body.label, 80));
    }
    if (body.emoji !== undefined) {
      fields.push("emoji = ?");
      values.push(optionalText(body.emoji, 8));
    }
    if (body.hint !== undefined) {
      fields.push("hint = ?");
      values.push(optionalText(body.hint, 120));
    }
    if (body.active !== undefined) {
      fields.push("active = ?");
      values.push(body.active ? 1 : 0);
    }
    if (body.sortOrder !== undefined) {
      fields.push("sort_order = ?");
      values.push(Number(body.sortOrder) || 0);
    }
    if (fields.length === 0) return { ok: true };
    values.push(Number(id));
    db.prepare(`UPDATE rejection_reasons SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return { ok: true };
  });
}
