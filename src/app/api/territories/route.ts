import { requireRole } from "@/lib/auth";
import { addStreetEntries, addStreets, createTerritory, freeArea } from "@/lib/queries";
import { parseShape, shapeToJson } from "@/lib/geo/area";
import {
  handle,
  optionalNumber,
  optionalText,
  parseStreetList,
  requireText,
} from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requireRole("LEADER");
    const body = await request.json();

    // Die Flaeche kommt aus der Kartenauswahl und ist optional: Gebiete lassen
    // sich weiterhin allein ueber die eingefuegte Strassenliste anlegen.
    // Schon vergebene Gebiete werden ausgespart.
    const area = body.area ? freeArea(leader.team_id, parseShape(body.area)) : null;

    const id = createTerritory({
      teamId: leader.team_id,
      name: requireText(body.name, "Gebietsname"),
      city: optionalText(body.city, 120),
      postalCode: optionalText(body.postalCode, 10),
      assignedUserId: optionalNumber(body.assignedUserId),
      note: optionalText(body.note),
      dueDate: optionalText(body.dueDate, 10) || null,
      areaJson: area ? shapeToJson(area) : "",
    });

    const fromMap = parseStreetList(body.streetList);
    const streetsRaw = optionalText(body.streets, 20000);
    const added =
      (fromMap.length > 0 ? addStreetEntries(id, fromMap) : 0) +
      (streetsRaw ? addStreets(id, streetsRaw) : 0);

    return { ok: true, id, streets: added };
  });
}
