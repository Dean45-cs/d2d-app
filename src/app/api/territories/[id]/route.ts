import { requireRole, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getTerritory } from "@/lib/queries";
import { handle, optionalNumber, optionalText } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const territoryId = Number(id);
    const territory = getTerritory(territoryId, user.team_id);
    if (!territory) throw new Error("Gebiet nicht gefunden.");

    const body = await request.json();
    const db = getDb();

    // Vertriebler duerfen nur den Status ihres eigenen Gebiets aendern.
    if (user.role !== "LEADER") {
      if (territory.assigned_user_id !== user.id) {
        throw new Error("Dieses Gebiet ist dir nicht zugeteilt.");
      }
      const status = optionalText(body.status, 10);
      if (!["OPEN", "ACTIVE", "DONE", "PAUSED"].includes(status)) {
        throw new Error("Unbekannter Status.");
      }
      db.prepare("UPDATE territories SET status = ? WHERE id = ?").run(status, territoryId);
      return { ok: true };
    }

    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (body.name !== undefined) set("name", optionalText(body.name, 120));
    if (body.city !== undefined) set("city", optionalText(body.city, 120));
    if (body.postalCode !== undefined) set("postal_code", optionalText(body.postalCode, 10));
    if (body.note !== undefined) set("note", optionalText(body.note));
    if (body.dueDate !== undefined) set("due_date", optionalText(body.dueDate, 10) || null);
    if (body.assignedUserId !== undefined) {
      const assignee = optionalNumber(body.assignedUserId);
      if (assignee !== null) {
        const member = db
          .prepare("SELECT id FROM users WHERE id = ? AND team_id = ?")
          .get(assignee, user.team_id);
        if (!member) throw new Error("Mitarbeiter gehört nicht zu diesem Team.");
      }
      set("assigned_user_id", assignee);
      if (body.status === undefined && assignee !== null && territory.status === "OPEN") {
        set("status", "ACTIVE");
      }
    }
    if (body.status !== undefined) {
      const status = optionalText(body.status, 10);
      if (!["OPEN", "ACTIVE", "DONE", "PAUSED"].includes(status)) {
        throw new Error("Unbekannter Status.");
      }
      set("status", status);
    }

    if (fields.length === 0) return { ok: true };
    values.push(territoryId);
    db.prepare(`UPDATE territories SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return { ok: true };
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const leader = await requireRole("LEADER");
    const { id } = await params;
    getDb()
      .prepare("DELETE FROM territories WHERE id = ? AND team_id = ?")
      .run(Number(id), leader.team_id);
    return { ok: true };
  });
}
