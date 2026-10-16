import { requirePermission, territoryAssignee } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { addStreetEntries, addStreets, createTerritory, freeArea, withoutTakenHouses } from "@/lib/queries";
import { parseShape, shapeToJson } from "@/lib/geo/area";
import {
  handle,
  optionalText,
  parseStreetList,
  requireText,
} from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requirePermission("territories.create");
    const body = await request.json();

    // Die Flaeche kommt aus der Kartenauswahl und ist optional: Gebiete lassen
    // sich weiterhin allein ueber die eingefuegte Strassenliste anlegen.
    // Schon vergebene Gebiete werden ausgespart.
    const area = body.area ? freeArea(leader.team_id, parseShape(body.area)) : null;

    const assignedUserId = territoryAssignee(leader, body.assignedUserId, true);
    return getDb().transaction(() => {
      // Vor dem Anlegen pruefen: sonst zaehlte die eigene neue Flaeche als "fremd"
      // und das Gebiet bekaeme keines seiner Haeuser.
      const listed = parseStreetList(body.streetList);
      const fromMap = withoutTakenHouses(leader.team_id, listed);
      const id = createTerritory({
        teamId: leader.team_id,
        name: requireText(body.name, "Gebietsname"),
        city: optionalText(body.city, 120),
        postalCode: optionalText(body.postalCode, 10),
        assignedUserId,
        createdBy: leader.id,
        note: optionalText(body.note),
        dueDate: optionalText(body.dueDate, 10) || null,
        areaJson: area ? shapeToJson(area) : "",
      });

      const streetsRaw = optionalText(body.streets, 20000);
      if (listed.length > 0 && fromMap.length === 0 && !streetsRaw) {
        throw new Error("Die Häuser in dieser Fläche gehören schon zu anderen Gebieten.");
      }
      const added =
        (fromMap.length > 0 ? addStreetEntries(id, fromMap) : 0) +
        (streetsRaw ? addStreets(id, streetsRaw) : 0);

      return { ok: true, id, streets: added };
    })();
  });
}
