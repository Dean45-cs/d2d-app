import { assertPermission, assertTerritoryAccess } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { handle, optionalText } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Prueft, dass die Strasse zum Team des Nutzers gehoert. */
function loadStreet(streetId: number, teamId: number) {
  const row = getDb()
    .prepare(
      `SELECT s.*, t.team_id, t.assigned_user_id, t.created_by
         FROM streets s JOIN territories t ON t.id = s.territory_id
        WHERE s.id = ? AND t.team_id = ?`,
    )
    .get(streetId, teamId) as
    | { id: number; team_id: number; assigned_user_id: number | null; created_by: number | null }
    | undefined;
  if (!row) throw new Error("Straße nicht gefunden.");
  return row;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const street = loadStreet(Number(id), user.team_id);
    assertTerritoryAccess(user, street);

    const body = await request.json();
    if (body.units !== undefined || (body.status !== undefined && street.assigned_user_id !== user.id)) assertPermission(user, "territories.edit");
    const db = getDb();
    if (body.status !== undefined) {
      const status = optionalText(body.status, 10);
      if (!["OPEN", "ACTIVE", "DONE"].includes(status)) {
        throw new Error("Unbekannter Status.");
      }
      db.prepare("UPDATE streets SET status = ? WHERE id = ?").run(status, street.id);
    }
    if (body.units !== undefined) {
      // Wie beim Anlegen: ganze Wohneinheiten in vernuenftiger Groesse.
      db.prepare("UPDATE streets SET units = ? WHERE id = ?").run(
        Math.max(0, Math.min(9999, Math.round(Number(body.units) || 0))),
        street.id,
      );
    }
    return { ok: true };
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    assertPermission(user, "territories.edit");
    const { id } = await params;
    const street = loadStreet(Number(id), user.team_id);
    assertTerritoryAccess(user, street);
    getDb().prepare("DELETE FROM streets WHERE id = ?").run(street.id);
    return { ok: true };
  });
}
