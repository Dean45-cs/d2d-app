import { assertTerritoryAccess } from "./permissions";
import { AuthError } from "./auth";
import { getDb } from "./db";
import { doorBlocked, ensureDoorbell, ensureHouseNumber, requireTeamStreet } from "./queries";
import { optionalNumber, optionalText } from "./api";
import { normalizeSlot } from "./appointments";
import { appointmentTimeZone, appointmentUtc } from "./appointment-time";
import type { Territory, User, VisitOutcome } from "./types";
import { createVisitOnce, findVisitRequest, parseVisitRequestId } from "./visit-idempotency";
import { getLevelProgress } from "./level-queries";

const OUTCOMES: VisitOutcome[] = ["NOT_HOME", "MET_NO_SALE", "APPOINTMENT", "SALE"];

export function recordVisit(user: User, body: Record<string, unknown>) {
  const db = getDb();

  // Neue Offline-Eintraege bleiben an die Person gebunden, die sie erfasst hat.
  if (body.ownerUserId !== undefined && body.ownerUserId !== user.id) {
    throw new AuthError("Dieser Eintrag gehört zu einem anderen Konto. Bitte melde dich dort wieder an.", 403);
  }
  const clientRequestId = parseVisitRequestId(body.clientRequestId);
  const existing = findVisitRequest(user.team_id, user.id, clientRequestId);
  if (existing) {
    const progress = getLevelProgress(user.team_id, user.id);
    return { ok: true, ...existing, progression: { progress, awardedXp: 0, previousLevel: progress.level, levelUp: false } };
  }

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

  if (territoryId !== null) {
    const territory = db.prepare("SELECT * FROM territories WHERE id = ? AND team_id = ?").get(territoryId, user.team_id) as Territory;
    assertTerritoryAccess(user, territory);
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
  if (streetId !== null && houseNumber) {
    const houseNumberId = ensureHouseNumber(streetId, houseNumber);
    // Eine Sperre muss auch halten, wenn der Eintrag nachgesendet wird.
    if (doorBlocked("house_numbers", houseNumberId)) {
      throw new Error("Diese Adresse ist gesperrt.");
    }
    if (doorbellLabel) {
      doorbellId = ensureDoorbell(
        houseNumberId,
        doorbellLabel,
        optionalText(body.doorbellFloor, 20),
      );
      if (doorBlocked("doorbells", doorbellId)) {
        throw new Error("Diese Klingel ist gesperrt.");
      }
    }
  }

  // Termin: die Ortszeit von der Tuer, plus Ansprechpartner fuer den Rueckweg.
  const followUpAt = outcome === "APPOINTMENT" ? normalizeSlot(body.followUpAt) : "";

  if (outcome === "APPOINTMENT" && !followUpAt) throw new Error("Bitte Datum und Uhrzeit angeben.");
  const zone = outcome === "APPOINTMENT" ? appointmentTimeZone(body.followUpTimeZone) : null;
  const utc = zone ? appointmentUtc(followUpAt, zone) : null;

  const input = {
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
    followUpAt: followUpAt || null,
    contactName: optionalText(body.contactName, 120),
    contactPhone: optionalText(body.contactPhone, 40),
    lat: optionalNumber(body.lat),
    lng: optionalNumber(body.lng),
  };

  const result = db.transaction(() => {
    const before = getLevelProgress(user.team_id, user.id);
    const saved = createVisitOnce(user.team_id, user.id, clientRequestId, input);
    if (outcome === "APPOINTMENT" && !saved.replayed && saved.id !== null) {
      db.prepare("UPDATE visits SET follow_up_timezone = ?, follow_up_utc = ? WHERE id = ?").run(zone, utc, saved.id);
    }
    const progress = getLevelProgress(user.team_id, user.id);
    return {
      ...saved,
      progression: {
        progress,
        awardedXp: progress.totalXp - before.totalXp,
        previousLevel: before.level,
        levelUp: progress.level > before.level,
      },
    };
  }).immediate();

  return result;
}
