import { hasPermission } from "@/lib/permissions";
import { AuthError, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { handle } from "@/lib/api";
import { normalizeSlot } from "@/lib/appointments";
import { appointmentTimeZone } from "@/lib/appointment-time";
import { requireTeamVisit, setAppointmentDone, setAppointmentSlot } from "@/lib/queries";
import { getLevelProgress } from "@/lib/level-queries";

export const dynamic = "force-dynamic";

/**
 * Loescht einen gerade erfassten Eintrag ("Rückgängig" an der Tür).
 * Erlaubt nur fuer eigene Eintraege der letzten 15 Minuten - mit dem Recht
 * "Besuche korrigieren" auch aeltere und fremde Eintraege des Teams.
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

    if (!hasPermission(user, "visits.correct")) {
      if (visit.user_id !== user.id) throw new AuthError("Das ist nicht dein Eintrag.", 403);
      const ageMinutes =
        (Date.now() - new Date(`${visit.created_at.replace(" ", "T")}Z`).getTime()) / 60000;
      if (ageMinutes > 15) {
        throw new Error("Der Eintrag ist älter als 15 Minuten – bitte an die Teamleitung wenden.");
      }
    }

    const progression = db.transaction(() => {
      const before = getLevelProgress(user.team_id, visit.user_id);
      db.prepare("DELETE FROM visits WHERE id = ?").run(visit.id);
      const progress = getLevelProgress(user.team_id, visit.user_id);
      return { progress, awardedXp: progress.totalXp - before.totalXp, previousLevel: before.level, levelUp: false };
    }).immediate();
    return { ok: true, progression };
  });
}

/**
 * Termin abhaken oder verschieben.
 *
 * Der Termin gehoert dem, der ihn vereinbart oder per Gebietsuebergabe
 * uebernommen hat; mit "Teamtermine verwalten" auch die Termine des Teams -
 * etwa wenn jemand krank ist und der Rueckweg neu verteilt werden muss.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const visit = requireTeamVisit(Number(id), user.team_id);
    if (!hasPermission(user, "appointments.team") && visit.user_id !== user.id) {
      throw new AuthError("Das ist nicht dein Termin.", 403);
    }
    if (visit.outcome !== "APPOINTMENT") throw new Error("Das ist kein Termin.");

    const body = await request.json();

    if (body.followUpAt !== undefined) {
      const slot = normalizeSlot(body.followUpAt);
      if (!slot) throw new Error("Bitte Datum und Uhrzeit angeben.");
      const current = getDb().prepare("SELECT follow_up_timezone FROM visits WHERE id = ?").get(visit.id) as { follow_up_timezone: string };
      setAppointmentSlot(visit.id, slot, appointmentTimeZone(body.followUpTimeZone ?? current.follow_up_timezone));
      return { ok: true, followUpAt: slot };
    }

    if (body.done !== undefined) {
      setAppointmentDone(visit.id, Boolean(body.done));
      return { ok: true, done: Boolean(body.done) };
    }

    return { ok: true };
  });
}
