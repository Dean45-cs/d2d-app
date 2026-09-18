import { requireRole } from "@/lib/auth";
import { createTerritories, type TerritoryDraft } from "@/lib/queries";
import { parseArea } from "@/lib/geo/area";
import { MAX_PLOTS } from "@/lib/geo/split";
import {
  handle,
  optionalNumber,
  optionalText,
  parseStreetList,
  requireText,
} from "@/lib/api";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Legt ein aufgeteiltes Gebiet an: mehrere Teilgebiete mit je eigener Flaeche,
 * Strassenliste und Zustaendigkeit, in einem Zug.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requireRole("LEADER");
    const body = await request.json();

    const groups = Array.isArray(body.groups) ? body.groups : [];
    if (groups.length < 2) throw new Error("Zum Aufteilen braucht es mindestens zwei Teilgebiete.");
    if (groups.length > MAX_PLOTS) {
      throw new Error(`Mehr als ${MAX_PLOTS} Teilgebiete auf einmal sind nicht vorgesehen.`);
    }

    const city = optionalText(body.city, 120);
    const postalCode = optionalText(body.postalCode, 10);
    const note = optionalText(body.note);
    const dueDate = optionalText(body.dueDate, 10) || null;

    const members = getDb()
      .prepare("SELECT id FROM users WHERE team_id = ?")
      .all(leader.team_id) as Array<{ id: number }>;
    const memberIds = new Set(members.map((m) => m.id));

    const drafts: TerritoryDraft[] = groups.map((group: Record<string, unknown>, index: number) => {
      const assignedUserId = optionalNumber(group.assignedUserId);
      if (assignedUserId !== null && !memberIds.has(assignedUserId)) {
        throw new Error("Mitarbeiter gehört nicht zu diesem Team.");
      }
      const streets = parseStreetList(group.streetList);
      if (streets.length === 0) {
        throw new Error(`Teilgebiet ${index + 1} enthält keine Straßen.`);
      }
      return {
        name: requireText(group.name, `Name von Teilgebiet ${index + 1}`, 120),
        city,
        postalCode,
        assignedUserId,
        note,
        dueDate,
        areaJson: group.area ? JSON.stringify(parseArea(group.area)) : "",
        streets,
      };
    });

    const ids = createTerritories(leader.team_id, drafts);
    return { ok: true, ids };
  });
}
