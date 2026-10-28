import { requirePermission, territoryAssignee } from "@/lib/permissions";
import { createTerritories, freeArea, withoutTakenHouses, type TerritoryDraft } from "@/lib/queries";
import { parseShape, shapeToJson } from "@/lib/geo/area";
import type { Shape } from "@/lib/geo/shape";
import { MAX_PLOTS, regroupByArea } from "@/lib/geo/split";
import {
  handle,
  optionalText,
  parseStreetList,
  requireText,
} from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Legt ein aufgeteiltes Gebiet an: mehrere Teilgebiete mit je eigener Flaeche,
 * Strassenliste und Zustaendigkeit, in einem Zug - und als Gruppe.
 *
 * Die Flaechen sind die Wahrheit: Der Server ordnet jedes Haus selbst dem
 * Teilgebiet zu, in dessen Flaeche es liegt, egal wie die App die Strassen
 * verteilt hat. So steht nie ein Haus in einem Gebiet, das auf der Karte
 * woanders liegt.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requirePermission("territories.create");
    const body = await request.json();

    const groups: Array<Record<string, unknown>> = Array.isArray(body.groups) ? body.groups : [];
    if (groups.length < 2) throw new Error("Zum Aufteilen braucht es mindestens zwei Teilgebiete.");
    if (groups.length > MAX_PLOTS) {
      throw new Error(`Mehr als ${MAX_PLOTS} Teilgebiete auf einmal sind nicht vorgesehen.`);
    }

    const city = optionalText(body.city, 120);
    const postalCode = optionalText(body.postalCode, 10);
    const note = optionalText(body.note);
    const dueDate = optionalText(body.dueDate, 10) || null;

    const parsed = groups.map((group, index) => {
      const listed = parseStreetList(group.streetList);
      if (listed.length === 0) throw new Error(`Teilgebiet ${index + 1} enthält keine Straßen.`);
      return {
        name: requireText(group.name, `Name von Teilgebiet ${index + 1}`, 120),
        assignedUserId: territoryAssignee(leader, group.assignedUserId, true),
        listed,
        drawn: group.area ? parseShape(group.area) : null,
      };
    });
    // Aeltere App-Versionen schicken keinen Namen fuer das Ganze: "Nordstadt (1/3)" -> "Nordstadt".
    const groupName =
      optionalText(body.name, 120) || parsed[0].name.replace(/\s*\(\d+\/\d+\)\s*$/, "") || parsed[0].name;

    // Die Teilgebiete teilen sich die Flaeche lueckenlos - keines darf in ein
    // anderes oder in ein schon vergebenes Gebiet ragen.
    const claimed: Shape[] = [];
    const areas = parsed.map((group) => {
      if (!group.drawn) return null;
      const area = freeArea(leader.team_id, group.drawn, { avoid: claimed });
      claimed.push(area);
      return area;
    });

    const regrouped = regroupByArea(parsed.map((group, index) => ({ area: areas[index], streets: group.listed })));

    const drafts: TerritoryDraft[] = parsed.map((group, index) => {
      if (regrouped[index].length === 0) {
        throw new Error(`In der Fläche von Teilgebiet ${index + 1} liegen keine Häuser. Bitte die Aufteilung neu laden.`);
      }
      const streets = withoutTakenHouses(leader.team_id, regrouped[index]);
      if (streets.length === 0) {
        throw new Error(`Die Häuser von Teilgebiet ${index + 1} gehören schon zu anderen Gebieten.`);
      }
      return {
        name: group.name,
        city,
        postalCode,
        assignedUserId: group.assignedUserId,
        note,
        dueDate,
        areaJson: areas[index] ? shapeToJson(areas[index]) : "",
        streets,
      };
    });

    const ids = createTerritories(leader.team_id, drafts, leader.id, groupName);
    return { ok: true, ids };
  });
}
