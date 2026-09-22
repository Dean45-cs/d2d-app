import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  createOrder,
  createVisit,
  doorBlocked,
  ensureDoorbell,
  ensureHouseNumber,
  findOrderByRef,
  listVisits,
  requireTeamStreet,
} from "@/lib/queries";
import { handle, optionalNumber, optionalText, parseOrderPayload } from "@/lib/api";
import { normalizeSlot } from "@/lib/appointments";
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

    /*
     * Auftrag: liegt er bei, entsteht er zusammen mit dem Abschluss. Beides in
     * einem Aufruf, damit es auch beim Nachsenden ohne Netz eine Einheit
     * bleibt - ein Abschluss ohne Auftrag oder umgekehrt waere nur Arbeit.
     */
    const orderPayload =
      outcome === "SALE" && body.order ? parseOrderPayload(body.order) : null;

    /*
     * Kommt derselbe Auftrag ein zweites Mal an - etwa weil die Antwort auf
     * dem Weg verloren ging -, ist hier Schluss: weder ein zweiter Auftrag
     * noch ein zweiter Tuereintrag. Die Kennung vom Geraet macht das moeglich.
     */
    if (orderPayload) {
      const known = findOrderByRef(user.team_id, orderPayload.clientRef);
      if (known) return { ok: true, id: known.visit_id, orderId: known.id };
    }

    const address =
      orderPayload && streetId !== null
        ? (db
            .prepare(
              `SELECT s.name AS street_name, t.postal_code, t.city
                 FROM streets s JOIN territories t ON t.id = s.territory_id
                WHERE s.id = ?`,
            )
            .get(streetId) as
            | { street_name: string; postal_code: string; city: string }
            | undefined)
        : undefined;

    const write = db.transaction(() => {
      const visitId = createVisit({
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
      });

      if (!orderPayload) return { visitId, orderId: null as number | null };

      const order = createOrder({
        ...orderPayload,
        teamId: user.team_id,
        userId: user.id,
        visitId,
        territoryId,
        streetId,
        streetName: address?.street_name ?? "",
        houseNumber,
        doorbellLabel,
        postalCode: address?.postal_code ?? "",
        city: address?.city ?? "",
      });
      return { visitId, orderId: order.id };
    });

    const { visitId, orderId } = write();
    return { ok: true, id: visitId, orderId };
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
