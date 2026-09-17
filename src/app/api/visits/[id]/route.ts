import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { handle } from "@/lib/api";

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
