import { requireUser } from "@/lib/auth";
import { handle, optionalNumber, optionalText, parseDoorbellList } from "@/lib/api";
import {
  addDoorbells,
  ensureHouseNumber,
  listDoorbells,
  requireTeamStreet,
  setBuildingType,
  setDoorBlocked,
} from "@/lib/queries";
import type { BuildingType } from "@/lib/types";

export const dynamic = "force-dynamic";

const BUILDING_TYPES: BuildingType[] = ["", "EFH", "MFH"];

/**
 * Ein Haus beschreiben: Haustyp und Klingelschilder.
 *
 * Bewusst ohne IDs vom Client - erkannt wird ueber Strasse, Hausnummer und den
 * Namen auf dem Schild. Damit ist der Aufruf idempotent und laesst sich
 * gefahrlos nachsenden, wenn er im Treppenhaus ohne Netz in der Warteschlange
 * lag. Beide Angaben sind einzeln erlaubt: nur der Typ, nur neue Schilder oder
 * beides auf einmal.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json();

    const streetId = optionalNumber(body.streetId);
    if (streetId === null) throw new Error("Straße fehlt.");
    requireTeamStreet(streetId, user.team_id);

    const number = optionalText(body.houseNumber, 20);
    if (!number) throw new Error("Hausnummer fehlt.");
    const houseNumberId = ensureHouseNumber(streetId, number);

    if (body.buildingType !== undefined) {
      const type = optionalText(body.buildingType, 4).toUpperCase() as BuildingType;
      if (!BUILDING_TYPES.includes(type)) throw new Error("Unbekannter Haustyp.");
      setBuildingType(houseNumberId, type);
    }

    let added = 0;
    if (body.doorbells !== undefined) {
      added = addDoorbells(houseNumberId, parseDoorbellList(body.doorbells));
    }

    /*
     * Sperren darf jeder, der an der Tuer steht - dort faellt der Widerspruch
     * an. Aufheben nur die Teamleitung: sonst raeumt der naechste Kollege die
     * Sperre weg, weil er die Vorgeschichte nicht kennt.
     */
    if (body.blocked !== undefined) {
      if (body.blocked) {
        setDoorBlocked("house_numbers", houseNumberId, user.id, optionalText(body.blockedNote, 200));
      } else {
        if (user.role !== "LEADER") throw new Error("Nur die Teamleitung kann eine Sperre aufheben.");
        setDoorBlocked("house_numbers", houseNumberId, null);
      }
    }

    return { ok: true, houseNumberId, added, doorbells: listDoorbells([houseNumberId]) };
  });
}
