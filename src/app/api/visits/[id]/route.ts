import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { handle } from "@/lib/api";
import { normalizeSlot } from "@/lib/appointments";
import { requireTeamVisit, setAppointmentDone, setAppointmentSlot } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Loescht einen gerade erfassten Eintrag ("Rückgängig" an der Tür).
 * Erlaubt nur fuer eigene Eintraege der letzten 15 Minuten - die Teamleitung
 * darf auch aeltere Eintraege ihres Teams entfernen.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const db = getDb();

    const visit = db
      .prepare("SELECT id, user_id, team_id, created_at FROM visits WHERE id = ?")
      .get(Number(id)) as
      | { id: number; user_id: number; team_id: number; created_at: string }
      | undefined;
    if (!visit || visit.team_id !== user.team_id) {
      throw new Error("Eintrag nicht gefunden.");
    }

    if (user.role !== "LEADER") {
      if (visit.user_id !== user.id) throw new Error("Das ist nicht dein Eintrag.");
      const ageMinutes =
        (Date.now() - new Date(`${visit.created_at.replace(" ", "T")}Z`).getTime()) / 60000;
      if (ageMinutes > 15) {
        throw new Error("Der Eintrag ist älter als 15 Minuten – bitte an die Teamleitung wenden.");
      }
    }

    db.prepare("DELETE FROM visits WHERE id = ?").run(visit.id);
    return { ok: true };
  });
}

/**
 * Termin abhaken oder verschieben.
 *
 * Der eigene Termin gehoert dem, der ihn vereinbart hat; die Teamleitung darf
 * auch die Termine des Teams pflegen - etwa wenn jemand krank ist und der
 * Rueckweg neu verteilt werden muss.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const visit = requireTeamVisit(Number(id), user.team_id);
    if (user.role !== "LEADER" && visit.user_id !== user.id) {
      throw new Error("Das ist nicht dein Termin.");
    }
    if (visit.outcome !== "APPOINTMENT") throw new Error("Das ist kein Termin.");

    const body = await request.json();

    if (body.followUpAt !== undefined) {
      const slot = normalizeSlot(body.followUpAt);
      if (!slot) throw new Error("Bitte Datum und Uhrzeit angeben.");
      setAppointmentSlot(visit.id, slot);
      return { ok: true, followUpAt: slot };
    }

    if (body.done !== undefined) {
      setAppointmentDone(visit.id, Boolean(body.done));
      return { ok: true, done: Boolean(body.done) };
    }

    return { ok: true };
  });
}
