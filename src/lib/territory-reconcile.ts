import { getDb } from "./db";
import { readShape, shapeToJson } from "./geo/area";
import { shapeBounds, shapeContains, type Shape } from "./geo/shape";
import { assertTerritoryAccess, canAccessTerritory, permissionsFor } from "./permissions";
import { addStreetEntries, freeArea, getTerritory, withoutTakenHouses, type StreetInput } from "./queries";
import type { Territory, User } from "./types";

/**
 * Haeuser eines Gebiets mit seiner Flaeche abgleichen - beim Neuzeichnen der
 * Flaeche und auf Knopfdruck ("Häuser abgleichen").
 *
 * Die Flaeche ist die Wahrheit:
 *  - Haeuser ausserhalb, an denen noch niemand war, fallen weg. Liegen sie in
 *    einem anderen Gebiet, wandern sie dorthin (so repariert sich auch ein
 *    falsch aufgeteiltes Gebiet von selbst).
 *  - Haeuser ausserhalb mit Besuchen, Klingeln oder Sperre bleiben: Ihre
 *    Geschichte gehoert zu diesem Gebiet, und eine Sperre darf nie still
 *    verschwinden.
 *  - Haeuser innerhalb, die in einem anderen Gebiet stehen, dessen Flaeche
 *    sie gar nicht enthaelt, kommen hierher - wenn dort noch niemand war.
 *  - Neue Haeuser aus der Karte kommen dazu.
 *
 * Vorschau und Speichern laufen durch dieselbe Rechnung - was die Vorschau
 * zeigt, passiert auch.
 */

export interface ReconcileSummary {
  /** Neue Haeuser aus der Karte - und wie viele Strassen dafuer neu angelegt werden. */
  added: number;
  addedStreets: number;
  /** Unbearbeitete Haeuser ausserhalb, die hier wegfallen ... */
  removed: number;
  /** ... davon ins Gebiet, in dem sie liegen. */
  moved: number;
  /** Haeuser aus anderen Gebieten, die in dieser Flaeche liegen. */
  pulled: number;
  /** Bearbeitete Haeuser ausserhalb - bleiben. */
  keptWorked: number;
  /** Die Flaeche aendert sich. */
  areaChanged: boolean;
}

interface HouseRow {
  id: number;
  number: string;
  lat: number;
  lng: number;
  street_id: number;
  street: string;
  territory_id: number;
  street_lat: number | null;
  street_lng: number | null;
  worked: number;
}

/** Besucht, mit Klingeln oder gesperrt: an diesem Haus haengt Geschichte. */
const WORKED = `(h.blocked_at IS NOT NULL
  OR EXISTS (SELECT 1 FROM doorbells d WHERE d.house_number_id = h.id)
  OR EXISTS (SELECT 1 FROM visits v WHERE v.street_id = h.street_id
               AND lower(replace(v.house_number, ' ', '')) = lower(replace(h.number, ' ', ''))))`;

const HOUSE_COLUMNS = `h.id, h.number, h.lat, h.lng, h.street_id, s.name AS street, s.territory_id,
  s.lat AS street_lat, s.lng AS street_lng, ${WORKED} AS worked`;

const nameKey = (name: string) => name.trim().toLocaleLowerCase("de-DE");
const numberKey = (number: string) => number.replace(/\s+/g, "").toLowerCase();

/**
 * Rechnet den Abgleich durch und fuehrt ihn aus, wenn `apply` gesetzt ist.
 * `area`: neue Flaeche (wird ausgespart wie beim Speichern), undefined = die bisherige.
 */
export function reconcileTerritory(
  user: User,
  territoryId: number,
  input: { area?: Shape; streetList: StreetInput[] },
  apply: boolean,
): ReconcileSummary {
  const db = getDb();
  const run = () => {
    const territory = getTerritory(territoryId, user.team_id);
    if (!territory) throw new Error("Gebiet nicht gefunden.");
    assertTerritoryAccess(user, territory);

    const current = readShape(territory.area_json);
    const shape = input.area ? freeArea(user.team_id, input.area, { exceptId: territory.id }) : current;
    if (!shape) throw new Error("Dieses Gebiet hat noch keine Fläche.");
    const areaJson = shapeToJson(shape);
    const plan = planReconcile(user, territory, shape, input.streetList);

    if (apply) {
      if (areaJson !== territory.area_json) {
        db.prepare("UPDATE territories SET area_json = ? WHERE id = ?").run(areaJson, territory.id);
      }
      const touched = new Set<number>();
      for (const move of plan.moves) {
        touched.add(move.house.street_id);
        if (move.to === null) {
          db.prepare("DELETE FROM house_numbers WHERE id = ?").run(move.house.id);
          continue;
        }
        const target = ensureStreet(move.to, move.house);
        touched.add(target);
        db.prepare("UPDATE house_numbers SET street_id = ? WHERE id = ?").run(target, move.house.id);
      }
      if (plan.additions.length > 0) addStreetEntries(territory.id, plan.additions);
      tidyStreets([...touched]);
    }

    return {
      added: plan.additions.reduce((sum, street) => sum + (street.numbers?.length ?? 0), 0),
      addedStreets: plan.newStreets,
      removed: plan.moves.filter((move) => move.house.territory_id === territory.id).length,
      moved: plan.moves.filter((move) => move.house.territory_id === territory.id && move.to !== null).length,
      pulled: plan.moves.filter((move) => move.house.territory_id !== territory.id).length,
      keptWorked: plan.keptWorked,
      areaChanged: areaJson !== territory.area_json,
    };
  };
  return apply ? db.transaction(run).immediate() : run();
}

interface Plan {
  /** Hausumzuege: to = Zielgebiet, null = entfernen. */
  moves: Array<{ house: HouseRow; to: number | null }>;
  additions: StreetInput[];
  newStreets: number;
  keptWorked: number;
}

function planReconcile(user: User, territory: Territory, shape: Shape, streetList: StreetInput[]): Plan {
  const db = getDb();
  const rights = permissionsFor(user);

  // Andere Gebiete des Teams mit Flaeche, soweit diese Person sie bearbeiten darf.
  const others = (
    db
      .prepare("SELECT * FROM territories WHERE team_id = ? AND id <> ? AND area_json <> ''")
      .all(user.team_id, territory.id) as Territory[]
  ).flatMap((other) => {
    const area = readShape(other.area_json);
    return area && canAccessTerritory(user, other, rights) ? [{ territory: other, area }] : [];
  });

  // Welche Hausnummern ein Gebiet schon hat: Strassenname -> Nummern.
  const known = new Map<number, Map<string, Set<string>>>();
  const knownIn = (id: number) => {
    let streets = known.get(id);
    if (!streets) {
      streets = new Map();
      const rows = db
        .prepare(
          `SELECT s.name, h.number FROM house_numbers h JOIN streets s ON s.id = h.street_id WHERE s.territory_id = ?`,
        )
        .all(id) as Array<{ name: string; number: string }>;
      for (const row of rows) {
        const set = streets.get(nameKey(row.name)) ?? new Set<string>();
        set.add(numberKey(row.number));
        streets.set(nameKey(row.name), set);
      }
      known.set(id, streets);
    }
    return streets;
  };
  const has = (id: number, street: string, number: string) => knownIn(id).get(nameKey(street))?.has(numberKey(number)) ?? false;
  const claim = (id: number, street: string, number: string) => {
    const streets = knownIn(id);
    const set = streets.get(nameKey(street)) ?? new Set<string>();
    set.add(numberKey(number));
    streets.set(nameKey(street), set);
  };
  const release = (id: number, street: string, number: string) => knownIn(id).get(nameKey(street))?.delete(numberKey(number));

  const moves: Plan["moves"] = [];
  let keptWorked = 0;

  // 1. Eigene Haeuser ausserhalb der Flaeche.
  const own = db
    .prepare(
      `SELECT ${HOUSE_COLUMNS} FROM house_numbers h JOIN streets s ON s.id = h.street_id
        WHERE s.territory_id = ? AND h.lat IS NOT NULL AND h.lng IS NOT NULL`,
    )
    .all(territory.id) as HouseRow[];
  for (const house of own) {
    if (shapeContains(shape, [house.lat, house.lng])) continue;
    if (house.worked) {
      keptWorked += 1;
      continue;
    }
    // Was hier wegfaellt, macht seine Nummer frei - kommt sie aus der Karte innerhalb der Flaeche, gilt die.
    release(territory.id, house.street, house.number);
    const home = others.find((other) => shapeContains(other.area, [house.lat, house.lng]));
    if (home && !has(home.territory.id, house.street, house.number)) {
      claim(home.territory.id, house.street, house.number);
      moves.push({ house, to: home.territory.id });
    } else {
      moves.push({ house, to: null });
    }
  }

  // 2. Fremde Haeuser in dieser Flaeche, deren eigenes Gebiet sie gar nicht enthaelt.
  const bounds = shapeBounds(shape);
  const misplaced = db
    .prepare(
      `SELECT ${HOUSE_COLUMNS} FROM house_numbers h JOIN streets s ON s.id = h.street_id
         JOIN territories t ON t.id = s.territory_id
        WHERE t.team_id = ? AND t.id <> ? AND t.area_json <> ''
          AND h.lat BETWEEN ? AND ? AND h.lng BETWEEN ? AND ?`,
    )
    .all(user.team_id, territory.id, bounds.south, bounds.north, bounds.west, bounds.east) as HouseRow[];
  const otherById = new Map(others.map((other) => [other.territory.id, other]));
  for (const house of misplaced) {
    const home = otherById.get(house.territory_id);
    // Nur aus Gebieten, die diese Person bearbeiten darf - und nur, was dort wirklich falsch liegt.
    if (!home || house.worked) continue;
    if (!shapeContains(shape, [house.lat, house.lng]) || shapeContains(home.area, [house.lat, house.lng])) continue;
    if (has(territory.id, house.street, house.number)) continue;
    claim(territory.id, house.street, house.number);
    moves.push({ house, to: territory.id });
  }

  // 3. Neue Haeuser aus der Karte: nur, was in der Flaeche liegt und noch niemandem gehoert.
  const inside = streetList.flatMap((street) => {
    const numbers = street.numbers ?? [];
    if (numbers.length === 0) {
      const center: [number, number] | null = street.lat !== null && street.lng !== null ? [street.lat, street.lng] : null;
      return !center || shapeContains(shape, center) ? [street] : [];
    }
    const kept = numbers.filter((house) => house.lat === null || house.lng === null || shapeContains(shape, [house.lat, house.lng]));
    return kept.length > 0 ? [{ ...street, numbers: kept }] : [];
  });
  const streetNames = new Set(
    (db.prepare("SELECT name FROM streets WHERE territory_id = ?").all(territory.id) as Array<{ name: string }>).map(
      (row) => nameKey(row.name),
    ),
  );
  const additions = withoutTakenHouses(user.team_id, inside, territory.id).flatMap((street) => {
    const numbers = street.numbers ?? [];
    if (numbers.length === 0) return streetNames.has(nameKey(street.name)) ? [] : [street];
    const fresh = numbers.filter((house) => !has(territory.id, street.name, house.number));
    for (const house of fresh) claim(territory.id, street.name, house.number);
    return fresh.length > 0 ? [{ ...street, numbers: fresh }] : [];
  });
  // Haeuser, die hierher umziehen, bringen ihre Strasse mit, wenn es sie noch nicht gibt.
  for (const move of moves) {
    if (move.to === territory.id) streetNames.add(nameKey(move.house.street));
  }
  const newStreets = new Set(additions.map((street) => nameKey(street.name)).filter((name) => !streetNames.has(name))).size;

  return { moves, additions, newStreets, keptWorked };
}

/** Strasse gleichen Namens im Zielgebiet - angelegt, falls es sie dort noch nicht gibt. */
function ensureStreet(territoryId: number, house: HouseRow): number {
  const db = getDb();
  const streets = db.prepare("SELECT id, name FROM streets WHERE territory_id = ? ORDER BY id").all(territoryId) as Array<{
    id: number;
    name: string;
  }>;
  const existing = streets.find((street) => nameKey(street.name) === nameKey(house.street));
  if (existing) return existing.id;
  const { m } = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM streets WHERE territory_id = ?")
    .get(territoryId) as { m: number };
  return Number(
    db
      .prepare(
        `INSERT INTO streets (territory_id, name, house_numbers, units, sort_order, lat, lng)
         VALUES (?, ?, '', 0, ?, ?, ?)`,
      )
      .run(territoryId, house.street, m + 1, house.street_lat, house.street_lng).lastInsertRowid,
  );
}

/**
 * Nach dem Umzug: Spanne und Wohneinheiten der betroffenen Strassen neu
 * rechnen - nur bei Strassen aus der Karte (jedes Haus mit Lage); eine
 * von Hand eingetragene Strasse behaelt ihre "30 WE". Eine Strasse ohne
 * Haeuser und ohne Besuche verschwindet - sonst stuende sie leer in der Liste.
 */
function tidyStreets(streetIds: number[]): void {
  const db = getDb();
  for (const id of streetIds) {
    const houses = db
      .prepare("SELECT number, units, lat FROM house_numbers WHERE street_id = ? ORDER BY sort_order, number")
      .all(id) as Array<{ number: string; units: number; lat: number | null }>;
    if (houses.length === 0) {
      const visited = db.prepare("SELECT 1 FROM visits WHERE street_id = ? LIMIT 1").get(id);
      if (!visited) db.prepare("DELETE FROM streets WHERE id = ?").run(id);
      continue;
    }
    if (houses.some((house) => house.lat === null)) continue;
    const first = houses[0].number;
    const last = houses[houses.length - 1].number;
    db.prepare("UPDATE streets SET house_numbers = ?, units = ? WHERE id = ?").run(
      first === last ? first : `${first}-${last}`,
      houses.reduce((sum, house) => sum + Math.max(1, house.units), 0),
      id,
    );
  }
}
