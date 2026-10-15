import { assertPermission, assertStreetAccess } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { handle, optionalNumber, optionalText, parseDoorbellList } from "@/lib/api";
import {
  addDoorbells,
  ensureDoorbell,
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
    if (body.blocked !== undefined && typeof body.blocked !== "boolean") throw new Error("Ungültige Sperre.");

    const streetId = optionalNumber(body.streetId);
    if (streetId === null) throw new Error("Straße fehlt.");
    requireTeamStreet(streetId, user.team_id);
    assertStreetAccess(user, streetId);
    if (body.blocked === false) assertPermission(user, "doors.unblock");

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
     * an. Aufheben nur mit dem Recht "Türsperren aufheben": sonst raeumt der
     * naechste Kollege die Sperre weg, weil er die Vorgeschichte nicht kennt.
     *
     * Mit `bellLabel` gilt die Sperre nur dieser Klingel - auch einer, die
     * gerade erst (womoeglich ohne Netz) angelegt wurde und noch keine ID hat.
     * Ohne Namen gilt sie dem ganzen Haus.
     */
    if (body.blocked !== undefined) {
      const bellLabel = optionalText(body.bellLabel, 60);
      const target = bellLabel
        ? { table: "doorbells" as const, id: ensureDoorbell(houseNumberId, bellLabel, optionalText(body.bellFloor, 20)) }
        : { table: "house_numbers" as const, id: houseNumberId };
      if (body.blocked) {
        setDoorBlocked(target.table, target.id, user.id, optionalText(body.blockedNote, 200));
      } else {
        assertPermission(user, "doors.unblock");
        setDoorBlocked(target.table, target.id, null);
      }
    }

    return { ok: true, houseNumberId, added, doorbells: listDoorbells([houseNumberId]) };
  });
}
