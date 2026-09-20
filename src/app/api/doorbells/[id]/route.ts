import { requireUser } from "@/lib/auth";
import { handle, optionalText } from "@/lib/api";
import { deleteDoorbell, requireTeamDoorbell, updateDoorbell } from "@/lib/queries";

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

    const body = await request.json();
    updateDoorbell(bell.id, {
      label: body.label === undefined ? undefined : optionalText(body.label, 60),
      floor: body.floor === undefined ? undefined : optionalText(body.floor, 20),
    });
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
    if (bell.visit_count > 0) {
      throw new Error("An diesem Klingelschild hängen schon Einträge.");
    }
    deleteDoorbell(bell.id);
    return { ok: true };
  });
}
