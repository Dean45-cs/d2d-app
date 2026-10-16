import { assertPermission, assertStreetAccess, hasPermission } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { AuthError, requireUser } from "@/lib/auth";
import { handle, optionalText } from "@/lib/api";
import {
  deleteDoorbell,
  requireTeamDoorbell,
  setDoorBlocked,
  updateDoorbell,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Vertippt am Klingelbrett: Name oder Etage eines Schilds berichtigen. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const bell = requireTeamDoorbell(Number(id), user.team_id);
    const house = getDb().prepare("SELECT street_id FROM house_numbers WHERE id = ?").get(bell.house_number_id) as { street_id: number };
    assertStreetAccess(user, house.street_id);

    const body = await request.json();
    if (body.blocked !== undefined && typeof body.blocked !== "boolean") throw new Error("Ungültige Sperre.");
    if (body.blocked === false) assertPermission(user, "doors.unblock");
    updateDoorbell(bell.id, {
      label: body.label === undefined ? undefined : optionalText(body.label, 60),
      floor: body.floor === undefined ? undefined : optionalText(body.floor, 20),
    });

    // Sperren darf jeder an der Tuer, aufheben nur mit "Türsperren aufheben".
    if (body.blocked !== undefined) {
      if (body.blocked) {
        setDoorBlocked("doorbells", bell.id, user.id, optionalText(body.blockedNote, 200));
      } else {
        assertPermission(user, "doors.unblock");
        setDoorBlocked("doorbells", bell.id, null);
      }
    }
    return { ok: true };
  });
}

/**
 * Ein Schild wieder entfernen - aber nur, solange nichts daran haengt.
 * Sonst verschwaende der Loeschvorgang bereits erfasste Tueren.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const bell = requireTeamDoorbell(Number(id), user.team_id);
    const house = getDb().prepare("SELECT street_id FROM house_numbers WHERE id = ?").get(bell.house_number_id) as { street_id: number };
    assertStreetAccess(user, house.street_id);
    if (bell.visit_count > 0) {
      throw new Error("An diesem Klingelschild hängen schon Einträge.");
    }
    // Mit dem Schild ginge die Sperre weg - das darf nur, wer Sperren aufheben darf.
    if (bell.blocked_at && !hasPermission(user, "doors.unblock")) {
      throw new AuthError("Diese Klingel ist gesperrt („Nicht klingeln“). Entfernen kann nur, wer Türsperren aufheben darf.", 403);
    }
    deleteDoorbell(bell.id);
    return { ok: true };
  });
}
