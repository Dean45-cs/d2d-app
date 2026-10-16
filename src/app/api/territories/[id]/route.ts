import { recordTerritoryHandover } from "@/lib/territory-handover";
import { AuthError, requireUser } from "@/lib/auth";
import { assertPermission, assertTerritoryAccess, hasPermission, territoryAssignee } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { blockedDoorCount, freeArea, getTerritory } from "@/lib/queries";
import { parseShape, shapeToJson } from "@/lib/geo/area";
import { handle, optionalText, requireText } from "@/lib/api";

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
    assertTerritoryAccess(user, territory);

    const body = await request.json();
    const db = getDb();

    if (Object.keys(body).some((key) => !["status", "assignedUserId", "appointmentPolicy", "handoverNote", "expectedAssignedUserId"].includes(key))) assertPermission(user, "territories.edit");
    if (body.status !== undefined && territory.assigned_user_id !== user.id) assertPermission(user, "territories.edit");
    if (["assignedUserId", "appointmentPolicy", "handoverNote", "expectedAssignedUserId"].some((key) => body[key] !== undefined)) assertPermission(user, "territories.assign");
    if (body.assignedUserId === undefined && (body.appointmentPolicy !== undefined || body.handoverNote !== undefined)) throw new Error("Für eine Übergabe bitte die neue Zuteilung angeben.");

    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    // Die Flaeche laesst sich jederzeit neu auf der Karte zeichnen; null loescht sie.
    // Nachbargebiete werden ausgespart, die eigene alte Flaeche natuerlich nicht.
    if (body.area !== undefined) {
      set(
        "area_json",
        body.area === null
          ? ""
          : shapeToJson(freeArea(user.team_id, parseShape(body.area), { exceptId: territoryId })),
      );
    }
    if (body.name !== undefined) set("name", requireText(body.name, "Gebietsname", 120));
    if (body.city !== undefined) set("city", optionalText(body.city, 120));
    if (body.postalCode !== undefined) set("postal_code", optionalText(body.postalCode, 10));
    if (body.note !== undefined) set("note", optionalText(body.note));
    if (body.dueDate !== undefined) set("due_date", optionalText(body.dueDate, 10) || null);
    if (body.assignedUserId !== undefined) {
      const assignee = territoryAssignee(user, body.assignedUserId);
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
    db.transaction(() => {
      const current = getTerritory(territoryId, user.team_id);
      if (!current) throw new Error("Gebiet nicht gefunden.");
      if (body.assignedUserId !== undefined) {
        if (body.expectedAssignedUserId !== undefined && body.expectedAssignedUserId !== current.assigned_user_id) {
          throw new Error("Die Zuteilung wurde inzwischen geändert. Bitte die Seite neu laden.");
        }
        recordTerritoryHandover(user, current, territoryAssignee(user, body.assignedUserId),
          body.appointmentPolicy, optionalText(body.handoverNote, 1000));
      }
      db.prepare(`UPDATE territories SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }).immediate();
    return { ok: true };
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const leader = await requireUser();
    const { id } = await params;
    assertPermission(leader, "territories.delete");
    const territory = getTerritory(Number(id), leader.team_id);
    if (!territory) throw new Error("Gebiet nicht gefunden.");
    assertTerritoryAccess(leader, territory);
    const blocked = blockedDoorCount({ territoryId: territory.id });
    if (blocked > 0 && !hasPermission(leader, "doors.unblock")) {
      throw new AuthError(`In diesem Gebiet ${blocked === 1 ? "ist 1 Tür" : `sind ${blocked} Türen`} gesperrt („Nicht klingeln“). Löschen kann nur, wer Türsperren aufheben darf – sonst wäre die Sperre einfach weg.`, 403);
    }
    getDb()
      .prepare("DELETE FROM territories WHERE id = ? AND team_id = ?")
      .run(Number(id), leader.team_id);
    return { ok: true };
  });
}
