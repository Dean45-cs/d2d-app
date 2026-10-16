import { getDb } from "./db";
import { AuthError } from "./auth";
import { optionalNumber, optionalText } from "./api";
import { canAccessTerritory } from "./permissions";
import { doorBlocked, ensureDoorbell, ensureHouseNumber, getTerritory, ownsAppointmentAt, requireTeamStreet } from "./queries";
import { parseVisitRequestId } from "./visit-idempotency";
import { recordVisit } from "./record-visit";
import type { User } from "./types";

export interface SaleDraft {
  draft_key: string;
  label: string;
  created_at: string;
}

export function listSaleDrafts(user: User): SaleDraft[] {
  return getDb().prepare(`SELECT draft_key, label, created_at FROM sale_drafts
    WHERE team_id = ? AND user_id = ? AND status = 'OPEN' ORDER BY created_at DESC`)
    .all(user.team_id, user.id) as SaleDraft[];
}

/** A draft never creates a visit, XP or a feed post. Its address is immutable. */
export function changeSaleDraft(user: User, body: Record<string, unknown>) {
  const key = parseVisitRequestId(body.draftKey);
  if (!key) throw new Error("Auftrags-ID fehlt.");
  if (body.ownerUserId !== undefined && body.ownerUserId !== user.id) throw new AuthError("Dieser Auftrag gehört zu einem anderen Konto.", 403);
  const action = body.action;
  if (!["OPEN", "CONFIRM", "ABORT"].includes(String(action))) throw new Error("Unbekannte Auftragsaktion.");
  const db = getDb();
  return db.transaction(() => {
    const draft = db.prepare("SELECT * FROM sale_drafts WHERE draft_key = ? AND user_id = ? AND team_id = ?")
      .get(key, user.id, user.team_id) as { payload: string; status: string; visit_id: number | null } | undefined;
    if (draft) {
      if (action === "OPEN") return { ok: true, status: draft.status, replayed: true };
      if (draft.status !== "OPEN") {
        if ((action === "ABORT") !== (draft.status === "ABORTED")) throw new Error("Der Auftrag wurde bereits abgeschlossen oder abgebrochen.");
        return { ok: true, status: draft.status, id: draft.visit_id, replayed: true };
      }
      if (action === "ABORT") {
        db.prepare("UPDATE sale_drafts SET status = 'ABORTED' WHERE draft_key = ? AND user_id = ?").run(key, user.id);
        return { ok: true, status: "ABORTED", replayed: false };
      }
      const payload = JSON.parse(draft.payload) as Record<string, unknown>;
      // Klingel inzwischen umbenannt (etwa auf den Namen des Kunden): der Abschluss gehoert zu ihr,
      // nicht zu einem neu angelegten Schild mit dem alten Namen.
      if (typeof payload.doorbellId === "number") {
        const bell = db.prepare("SELECT label, floor FROM doorbells WHERE id = ?").get(payload.doorbellId) as
          | { label: string; floor: string }
          | undefined;
        if (bell) Object.assign(payload, { doorbellLabel: bell.label, doorbellFloor: bell.floor });
      }
      const result = recordVisit(
        user,
        // Bestaetigt ohne Netz: der Abschluss zaehlt fuer den Moment der Bestaetigung.
        { ...payload, clientRequestId: key, ownerUserId: user.id, outcome: "SALE", recordedAt: body.recordedAt },
        { fromDraft: true },
      );
      db.prepare("UPDATE sale_drafts SET status = 'CONFIRMED', visit_id = ? WHERE draft_key = ? AND user_id = ?")
        .run(result.id, key, user.id);
      return { ok: true, status: "CONFIRMED", ...result };
    }
    if (action !== "OPEN") throw new Error("Offener Auftrag nicht gefunden. Bitte zuerst synchronisieren.");
    const streetId = optionalNumber(body.streetId);
    const territoryId = streetId !== null ? requireTeamStreet(streetId, user.team_id).territory_id : optionalNumber(body.territoryId);
    if (territoryId === null || streetId === null) throw new Error("Bitte Gebiet und Straße wählen.");
    const territory = getTerritory(territoryId, user.team_id);
    if (!territory) throw new Error("Gebiet nicht gefunden.");
    const houseNumber = optionalText(body.houseNumber, 20);
    if (!houseNumber) throw new Error("Bitte Hausnummer wählen.");
    if (!canAccessTerritory(user, territory) && !ownsAppointmentAt(user, streetId, houseNumber, optionalText(body.doorbellLabel, 60))) {
      throw new AuthError("Dieses Gebiet ist für dich nicht freigegeben.", 403);
    }
    const houseId = ensureHouseNumber(streetId, houseNumber);
    if (doorBlocked("house_numbers", houseId)) throw new Error("Diese Adresse ist gesperrt.");
    const doorbellLabel = optionalText(body.doorbellLabel, 60);
    const doorbellFloor = optionalText(body.doorbellFloor, 20);
    const doorbellId = doorbellLabel ? ensureDoorbell(houseId, doorbellLabel, doorbellFloor) : null;
    if (doorbellId !== null && doorBlocked("doorbells", doorbellId)) throw new Error("Diese Klingel ist gesperrt.");
    const energyType = optionalText(body.energyType, 10);
    if (!["STROM", "GAS", "BEIDES"].includes(energyType)) throw new Error("Bitte Produkt wählen.");
    const payload = { territoryId, streetId, houseNumber, doorbellLabel, doorbellFloor, doorbellId, energyType,
      lat: optionalNumber(body.lat), lng: optionalNumber(body.lng) };
    const street = db.prepare("SELECT name FROM streets WHERE id = ?").get(streetId) as { name: string };
    const label = `${street.name} ${houseNumber}${doorbellLabel ? ` · ${doorbellLabel}` : ""}`;
    db.prepare("INSERT INTO sale_drafts(draft_key, user_id, team_id, payload, label) VALUES (?, ?, ?, ?, ?)")
      .run(key, user.id, user.team_id, JSON.stringify(payload), label);
    return { ok: true, status: "OPEN", replayed: false };
  }).immediate();
}
