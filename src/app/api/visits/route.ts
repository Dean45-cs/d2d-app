import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  createVisit,
  ensureDoorbell,
  ensureHouseNumber,
  listVisits,
  requireTeamStreet,
} from "@/lib/queries";
import { handle, optionalNumber, optionalText } from "@/lib/api";
import type { VisitOutcome } from "@/lib/types";

export const dynamic = "force-dynamic";

const OUTCOMES: VisitOutcome[] = ["NOT_HOME", "MET_NO_SALE", "APPOINTMENT", "SALE"];

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json();
    const db = getDb();

    const outcome = optionalText(body.outcome, 20) as VisitOutcome;
    if (!OUTCOMES.includes(outcome)) throw new Error("Unbekanntes Ergebnis.");

    // Strasse und Gebiet muessen zum Team gehoeren
    const streetId = optionalNumber(body.streetId);
    let territoryId = optionalNumber(body.territoryId);
    if (streetId !== null) {
      territoryId = requireTeamStreet(streetId, user.team_id).territory_id;
    } else if (territoryId !== null) {
      const territory = db
        .prepare("SELECT id FROM territories WHERE id = ? AND team_id = ?")
        .get(territoryId, user.team_id);
      if (!territory) throw new Error("Gebiet nicht gefunden.");
    }

    // Ablehnungsgrund nur bei "angetroffen, kein Abschluss"
    let reasonId = optionalNumber(body.reasonId);
    if (reasonId !== null) {
      const reason = db
        .prepare("SELECT id FROM rejection_reasons WHERE id = ? AND team_id = ?")
        .get(reasonId, user.team_id);
      if (!reason) throw new Error("Ablehnungsgrund nicht gefunden.");
    }
    if (outcome !== "MET_NO_SALE") reasonId = null;

    const energyType = optionalText(body.energyType, 10).toUpperCase();
    const houseNumber = optionalText(body.houseNumber, 20);

    /*
     * Die Klingel kommt als Name, nie als ID: ein Eintrag, der ohne Netz im
     * Treppenhaus entstanden ist, kennt keine ID vom Server. Fehlt das Schild
     * noch, wird es hier angelegt - der Weg ist online wie offline derselbe.
     */
    let doorbellId: number | null = null;
    const doorbellLabel = optionalText(body.doorbellLabel, 60);
    if (doorbellLabel && streetId !== null && houseNumber) {
      const houseNumberId = ensureHouseNumber(streetId, houseNumber);
      doorbellId = ensureDoorbell(
        houseNumberId,
        doorbellLabel,
        optionalText(body.doorbellFloor, 20),
      );
    }

    const id = createVisit({
      teamId: user.team_id,
      userId: user.id,
      territoryId,
      streetId,
      houseNumber,
      doorbellId,
      outcome,
      reasonId,
      reasonNote: optionalText(body.reasonNote, 500),
      energyType: (["STROM", "GAS", "BEIDES"].includes(energyType)
        ? energyType
        : "") as "" | "STROM" | "GAS" | "BEIDES",
      followUpAt: optionalText(body.followUpAt, 30) || null,
      lat: optionalNumber(body.lat),
      lng: optionalNumber(body.lng),
    });

    return { ok: true, id };
  });
}

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(request.url);
    const territoryId = optionalNumber(url.searchParams.get("territoryId"));
    return {
      visits: listVisits(user.team_id, {
        userId: user.role === "LEADER" ? undefined : user.id,
        territoryId: territoryId ?? undefined,
        limit: 50,
      }),
    };
  });
}
