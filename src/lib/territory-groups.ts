import { getDb } from "./db";
import { parseShape, readShape, shapeToJson } from "./geo/area";
import { unite } from "./geo/shape";
import { assertTerritoryAccess, canAccessTerritory, permissionsFor } from "./permissions";
import { getTerritory, TERRITORY_STATS_SQL, type TerritoryWithStats } from "./queries";
import { territoryProgress, type Progress } from "./progress";
import type { User } from "./types";

/**
 * Teilgebiete eines aufgeteilten Gebiets: Sie bleiben eine Gruppe mit
 * gemeinsamem Fortschritt und lassen sich wieder zusammenlegen - etwa wenn
 * jemand krank ist und ein anderer beide Haelften uebernimmt.
 */

export interface TerritoryGroup {
  id: number;
  team_id: number;
  name: string;
  created_by: number | null;
  created_at: string;
}

export function listGroups(teamId: number): Map<number, TerritoryGroup> {
  const rows = getDb()
    .prepare("SELECT * FROM territory_groups WHERE team_id = ?")
    .all(teamId) as TerritoryGroup[];
  return new Map(rows.map((row) => [row.id, row]));
}

export function getGroup(teamId: number, groupId: number | null): TerritoryGroup | null {
  if (!groupId) return null;
  const row = getDb()
    .prepare("SELECT * FROM territory_groups WHERE id = ? AND team_id = ?")
    .get(groupId, teamId) as TerritoryGroup | undefined;
  return row ?? null;
}

/** Alle Teilgebiete der Gruppe, die diese Person sehen darf - in der Reihenfolge ihrer Nummern. */
export function groupMembers(user: User, groupId: number | null): TerritoryWithStats[] {
  if (!groupId) return [];
  const rights = permissionsFor(user);
  const rows = getDb()
    .prepare(`${TERRITORY_STATS_SQL} WHERE t.team_id = ? AND t.group_id = ? ORDER BY t.id`)
    .all(user.team_id, groupId) as TerritoryWithStats[];
  return rows.filter((row) => canAccessTerritory(user, row, rights));
}

/**
 * Kurzer Name eines Teilgebiets unter dem Namen des Ganzen: "Nordstadt (2/3)"
 * wird "Teil 2 von 3" - in schmalen Listen bliebe sonst nur "Nordstadt …" stehen.
 */
export function partTitle(name: string, groupName: string): string {
  const rest = name.startsWith(groupName) ? name.slice(groupName.length).trim() : name;
  const numbered = rest.match(/^\((\d+)\/(\d+)\)$/);
  if (numbered) return `Teil ${numbered[1]} von ${numbered[2]}`;
  return rest || name;
}

/** Fortschritt mehrerer Teilgebiete zusammen - Haeuser und Tueren einfach addiert. */
export function combinedProgress(parts: Array<Parameters<typeof territoryProgress>[0]>): Progress {
  let done = 0;
  let total = 0;
  for (const part of parts) {
    const progress = territoryProgress(part);
    done += progress.done;
    total += progress.total;
  }
  return { done, total, label: `${done} von ${total} Türen` };
}

/**
 * Legt Teilgebiete derselben Gruppe in eines zusammen. Nichts geht verloren:
 * Strassen samt Hausnummern, Klingeln, Sperren und Besuchen ziehen um, die
 * Flaechen werden vereinigt. Die Strassen behalten ihre Nummer - so passen
 * auch Besuche, die gerade offline auf dem Handy warten.
 */
export function mergeTerritories(user: User, targetId: number, sourceIds: number[]): { merged: number } {
  const db = getDb();
  const ids = [...new Set(sourceIds.filter((id) => Number.isInteger(id) && id > 0 && id !== targetId))];
  if (ids.length === 0) throw new Error("Bitte mindestens ein Teilgebiet zum Zusammenlegen wählen.");

  return db
    .transaction(() => {
      const target = getTerritory(targetId, user.team_id);
      if (!target) throw new Error("Gebiet nicht gefunden.");
      assertTerritoryAccess(user, target);
      if (!target.group_id) throw new Error("Dieses Gebiet gehört zu keinem aufgeteilten Gebiet.");

      const sources = ids.map((id) => {
        const source = getTerritory(id, user.team_id);
        if (!source) throw new Error("Teilgebiet nicht gefunden.");
        assertTerritoryAccess(user, source);
        if (source.group_id !== target.group_id) {
          throw new Error("Zusammenlegen geht nur mit Teilgebieten desselben Gebiets.");
        }
        return source;
      });

      // Flaechen vereinigen - und pruefen, dass das Ergebnis wieder lesbar gespeichert wird.
      const shapes = [target, ...sources].flatMap((t) => {
        const shape = readShape(t.area_json);
        return shape ? [shape] : [];
      });
      let areaJson = target.area_json;
      if (shapes.length > 0) {
        const united = unite(shapes);
        if (!united) throw new Error("Die Flächen lassen sich nicht zusammenlegen.");
        areaJson = shapeToJson(united);
        if (areaJson) parseShape(areaJson);
      }

      const moveStreets = db.prepare("UPDATE streets SET territory_id = ? WHERE territory_id = ?");
      const moveVisits = db.prepare("UPDATE visits SET territory_id = ? WHERE territory_id = ? AND team_id = ?");
      const moveHandovers = db.prepare("UPDATE territory_handovers SET territory_id = ? WHERE territory_id = ?");
      const remove = db.prepare("DELETE FROM territories WHERE id = ? AND team_id = ?");
      for (const source of sources) {
        moveStreets.run(target.id, source.id);
        moveVisits.run(target.id, source.id, user.team_id);
        moveHandovers.run(target.id, source.id);
        remove.run(source.id, user.team_id);
      }

      // Strassen alphabetisch, geteilte Strassen mit ihren Haelften hintereinander.
      const streets = db
        .prepare("SELECT id, name, house_numbers FROM streets WHERE territory_id = ?")
        .all(target.id) as Array<{ id: number; name: string; house_numbers: string }>;
      streets.sort(
        (a, b) =>
          a.name.localeCompare(b.name, "de-DE") ||
          (Number.parseInt(a.house_numbers, 10) || 0) - (Number.parseInt(b.house_numbers, 10) || 0) ||
          a.id - b.id,
      );
      const order = db.prepare("UPDATE streets SET sort_order = ? WHERE id = ?");
      streets.forEach((street, index) => order.run(index + 1, street.id));

      // Fertig ist das Ganze erst, wenn jeder Teil fertig war.
      const allDone = [target, ...sources].every((t) => t.status === "DONE");
      const status =
        allDone ? "DONE" : target.status === "DONE" ? (target.assigned_user_id ? "ACTIVE" : "OPEN") : target.status;

      // Sind alle Teile wieder beisammen, ist es wieder ein ganz normales Gebiet mit dem Namen des Ganzen.
      const { remaining } = db
        .prepare("SELECT COUNT(*) AS remaining FROM territories WHERE group_id = ? AND id <> ?")
        .get(target.group_id, target.id) as { remaining: number };
      const group = getGroup(user.team_id, target.group_id);
      if (remaining === 0) {
        db.prepare("UPDATE territories SET area_json = ?, status = ?, name = ?, group_id = NULL WHERE id = ?").run(
          areaJson,
          status,
          group?.name || target.name,
          target.id,
        );
        db.prepare("DELETE FROM territory_groups WHERE id = ?").run(target.group_id);
      } else {
        db.prepare("UPDATE territories SET area_json = ?, status = ? WHERE id = ?").run(areaJson, status, target.id);
      }
      return { merged: sources.length };
    })
    .immediate();
}
