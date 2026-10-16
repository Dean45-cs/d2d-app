import { appointmentUtc } from "./appointment-time";
import { berlinSlot } from "./format";
import { getDb } from "./db";
import { canAccessTerritory, permissionsFor } from "./permissions";
import { bellKey, MAX_BELLS_PER_HOUSE, normalizeFloor, normalizeLabel } from "./doorbells";
import { MAX_NOT_HOME_ATTEMPTS } from "./doors";
import { METERS_PER_DEGREE, readShape } from "./geo/area";
import { shapeContains, subtract, type Shape } from "./geo/shape";
import type { DoorbellInput } from "./doorbells";
import type {
  BuildingType,
  Doorbell,
  EnergyPrice,
  RejectionReason,
  Street,
  Territory,
  User,
  VisitOutcome,
} from "./types";

/* ================================ Team ================================== */

export function listMembers(teamId: number): User[] {
  return getDb()
    .prepare(
      `SELECT id, team_id, manager_id, name, email, role, phone, active,
              avatar_src(id, avatar) AS avatar, bio, created_at
         FROM users WHERE team_id = ? ORDER BY active DESC, role, name`,
    )
    .all(teamId) as User[];
}

/* ============================== Gebiete ================================= */

export interface TerritoryWithStats extends Territory {
  assignee_name: string | null;
  street_count: number;
  unit_count: number;
  visit_count: number;
  met_count: number;
  sale_count: number;
  /** Hinterlegte Hausnummern - und wie viele davon erfasst sind (Mehrfamilienhaus: jede Klingel durch) oder gesperrt. */
  house_count: number;
  house_touched_count: number;
  /**
   * Strassen aus einer Liste (ohne Kartenimport): dort zaehlt jede Tuer - im
   * Mehrfamilienhaus jede Klingel -, mindestens so viele wie Wohneinheiten
   * angegeben sind. Die schon getippten Hausnummern stecken auch in
   * house_count/house_touched_count und werden dort herausgerechnet.
   */
  list_house_count: number;
  list_house_touched: number;
  list_door_total: number;
  list_door_done: number;
}

/** Eine Klingel ist durch, wenn gesperrt, angetroffen oder alle Versuche verbraucht (auch in listHouseNumbers). */
const BELL_DONE = `(d.blocked_at IS NOT NULL
  OR EXISTS (SELECT 1 FROM visits v WHERE v.doorbell_id = d.id AND v.outcome <> 'NOT_HOME')
  OR (SELECT COUNT(*) FROM visits v WHERE v.doorbell_id = d.id AND v.outcome = 'NOT_HOME') >= ${MAX_NOT_HOME_ATTEMPTS})`;

/** Haus erfasst: gesperrt, Einzeltuer besucht oder im Mehrfamilienhaus jede Klingel durch. */
const HOUSE_TOUCHED = `(h.blocked_at IS NOT NULL
  -- Einzeltuer: erfasst, sobald jemand dort war.
  OR (NOT EXISTS (SELECT 1 FROM doorbells d WHERE d.house_number_id = h.id)
      AND EXISTS (SELECT 1 FROM visits v WHERE v.street_id = h.street_id
        AND lower(replace(v.house_number, ' ', '')) = lower(replace(h.number, ' ', ''))))
  -- Mehrfamilienhaus: erst, wenn jede Klingel durch ist.
  OR (EXISTS (SELECT 1 FROM doorbells d WHERE d.house_number_id = h.id)
      AND NOT EXISTS (SELECT 1 FROM doorbells d WHERE d.house_number_id = h.id AND NOT ${BELL_DONE})))`;

/** Strasse ohne Kartenimport: keine ihrer Hausnummern hat eine Lage. */
const LIST_STREET = "NOT EXISTS (SELECT 1 FROM house_numbers x WHERE x.street_id = s.id AND x.lat IS NOT NULL)";
const BELLS_OF_HOUSE = "(SELECT COUNT(*) FROM doorbells d WHERE d.house_number_id = h.id)";

const TERRITORY_STATS_SQL = `
  SELECT t.*,
         u.name AS assignee_name,
         (SELECT COUNT(*) FROM streets s WHERE s.territory_id = t.id)              AS street_count,
         (SELECT COALESCE(SUM(s.units), 0) FROM streets s WHERE s.territory_id = t.id) AS unit_count,
         (SELECT COUNT(*) FROM visits v WHERE v.territory_id = t.id)               AS visit_count,
         (SELECT COUNT(*) FROM visits v WHERE v.territory_id = t.id
            AND v.outcome IN ('MET_NO_SALE','APPOINTMENT','SALE'))                 AS met_count,
         (SELECT COUNT(*) FROM visits v WHERE v.territory_id = t.id
            AND v.outcome = 'SALE')                                                AS sale_count,
         (SELECT COUNT(*) FROM house_numbers h JOIN streets s ON s.id = h.street_id
           WHERE s.territory_id = t.id)                                           AS house_count,
         (SELECT COUNT(*) FROM house_numbers h JOIN streets s ON s.id = h.street_id
           WHERE s.territory_id = t.id AND ${HOUSE_TOUCHED})                       AS house_touched_count,
         (SELECT COUNT(*) FROM house_numbers h JOIN streets s ON s.id = h.street_id
           WHERE s.territory_id = t.id AND ${LIST_STREET})                         AS list_house_count,
         (SELECT COUNT(*) FROM house_numbers h JOIN streets s ON s.id = h.street_id
           WHERE s.territory_id = t.id AND ${LIST_STREET} AND ${HOUSE_TOUCHED})    AS list_house_touched,
         (SELECT COALESCE(SUM(MAX(s.units,
                   (SELECT COALESCE(SUM(MAX(1, ${BELLS_OF_HOUSE})), 0) FROM house_numbers h WHERE h.street_id = s.id))), 0)
            FROM streets s WHERE s.territory_id = t.id AND ${LIST_STREET})         AS list_door_total,
         (SELECT COALESCE(SUM(CASE
                   WHEN h.blocked_at IS NOT NULL THEN MAX(1, ${BELLS_OF_HOUSE})
                   WHEN ${BELLS_OF_HOUSE} > 0 THEN
                     (SELECT COUNT(*) FROM doorbells d WHERE d.house_number_id = h.id AND ${BELL_DONE})
                   WHEN ${HOUSE_TOUCHED} THEN 1 ELSE 0 END), 0)
            FROM house_numbers h JOIN streets s ON s.id = h.street_id
           WHERE s.territory_id = t.id AND ${LIST_STREET})                         AS list_door_done
    FROM territories t
    LEFT JOIN users u ON u.id = t.assigned_user_id
`;

export function listTerritories(
  teamId: number,
  opts: { userId?: number } = {},
): TerritoryWithStats[] {
  const db = getDb();
  if (opts.userId) {
    return db
      .prepare(
        `${TERRITORY_STATS_SQL} WHERE t.team_id = ? AND t.assigned_user_id = ?
         ORDER BY CASE t.status WHEN 'ACTIVE' THEN 0 WHEN 'OPEN' THEN 1
                                WHEN 'PAUSED' THEN 2 ELSE 3 END, t.name`,
      )
      .all(teamId, opts.userId) as TerritoryWithStats[];
  }
  return db
    .prepare(
      `${TERRITORY_STATS_SQL} WHERE t.team_id = ?
       ORDER BY CASE t.status WHEN 'ACTIVE' THEN 0 WHEN 'OPEN' THEN 1
                              WHEN 'PAUSED' THEN 2 ELSE 3 END, t.name`,
    )
    .all(teamId) as TerritoryWithStats[];
}

export function getTerritory(
  id: number,
  teamId: number,
): TerritoryWithStats | null {
  const row = getDb()
    .prepare(`${TERRITORY_STATS_SQL} WHERE t.id = ? AND t.team_id = ?`)
    .get(id, teamId) as TerritoryWithStats | undefined;
  return row ?? null;
}

export function listAccessibleTerritories(user: User): TerritoryWithStats[] {
  const rights = permissionsFor(user);
  // Ohne "Alle Teamgebiete sehen" bleiben nur eigene und selbst angelegte Gebiete -
  // dann auch nur fuer diese die Kennzahlen rechnen statt fuers ganze Team.
  const territories = rights["territories.view_all"]
    ? listTerritories(user.team_id)
    : (getDb()
        .prepare(
          `${TERRITORY_STATS_SQL} WHERE t.team_id = ? AND (t.assigned_user_id = ? OR t.created_by = ?)
           ORDER BY CASE t.status WHEN 'ACTIVE' THEN 0 WHEN 'OPEN' THEN 1
                                  WHEN 'PAUSED' THEN 2 ELSE 3 END, t.name`,
        )
        .all(user.team_id, user.id, user.id) as TerritoryWithStats[]);
  return territories.filter((territory) => canAccessTerritory(user, territory, rights));
}

/** Gebiete ohne Kennzahlen - fuer Stellen, die nur Name, Ort, Status und Flaeche brauchen. Gleiche Reihenfolge wie listTerritories. */
export function listTerritoriesBasic(teamId: number): Territory[] {
  return getDb()
    .prepare(
      `SELECT t.* FROM territories t WHERE t.team_id = ?
       ORDER BY CASE t.status WHEN 'ACTIVE' THEN 0 WHEN 'OPEN' THEN 1
                              WHEN 'PAUSED' THEN 2 ELSE 3 END, t.name`,
    )
    .all(teamId) as Territory[];
}

export interface StreetWithStats extends Street {
  visit_count: number;
  met_count: number;
  sale_count: number;
  last_visit_at: string | null;
}

export function listStreets(territoryId: number): StreetWithStats[] {
  return getDb()
    .prepare(
      `SELECT s.*,
              (SELECT COUNT(*) FROM visits v WHERE v.street_id = s.id) AS visit_count,
              (SELECT COUNT(*) FROM visits v WHERE v.street_id = s.id
                 AND v.outcome IN ('MET_NO_SALE','APPOINTMENT','SALE'))  AS met_count,
              (SELECT COUNT(*) FROM visits v WHERE v.street_id = s.id
                 AND v.outcome = 'SALE')                                 AS sale_count,
              (SELECT MAX(v.created_at) FROM visits v WHERE v.street_id = s.id) AS last_visit_at
         FROM streets s
        WHERE s.territory_id = ?
        ORDER BY s.sort_order, s.name`,
    )
    .all(territoryId) as StreetWithStats[];
}

export function createTerritory(input: {
  teamId: number;
  name: string;
  city: string;
  postalCode: string;
  assignedUserId: number | null;
  note: string;
  dueDate: string | null;
  /** Auf der Karte gezeichnete Flaeche als JSON, sonst leer. */
  areaJson?: string;
  createdBy?: number;
}): number {
  const result = getDb()
    .prepare(
      `INSERT INTO territories
         (team_id, name, city, postal_code, assigned_user_id, note, due_date, status, area_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.teamId,
      input.name,
      input.city,
      input.postalCode,
      input.assignedUserId,
      input.note,
      input.dueDate,
      input.assignedUserId ? "ACTIVE" : "OPEN",
      input.areaJson ?? "",
      input.createdBy ?? null,
    );
  return result.lastInsertRowid as number;
}

/**
 * Was von einer gezeichneten Flaeche frei ist: die Flaechen der anderen
 * Gebiete des Teams (und alles in `avoid`) werden ausgespart. So koennen sich
 * zwei Gebiete nicht ueberschneiden - egal, was die Oberflaeche schickt.
 */
export function freeArea(
  teamId: number,
  shape: Shape,
  options: { exceptId?: number; avoid?: Shape[] } = {},
): Shape {
  const rows = getDb()
    .prepare("SELECT id, area_json FROM territories WHERE team_id = ? AND area_json <> ''")
    .all(teamId) as Array<{ id: number; area_json: string }>;
  const taken = rows.flatMap((row) => {
    const other = row.id === options.exceptId ? null : readShape(row.area_json);
    return other ? [other] : [];
  });
  const free = subtract(shape, [...taken, ...(options.avoid ?? [])]);
  if (free.length === 0) {
    throw new Error("Die Fläche liegt komplett in bereits vergebenen Gebieten.");
  }
  return free;
}

/** Gezeichnete Flaeche eines bestehenden Gebiets ersetzen. */
export function setTerritoryArea(territoryId: number, areaJson: string): void {
  getDb().prepare("UPDATE territories SET area_json = ? WHERE id = ?").run(areaJson, territoryId);
}

export interface HouseNumberInput {
  number: string;
  units: number;
  lat: number | null;
  lng: number | null;
}

export interface StreetInput {
  name: string;
  houseNumbers: string;
  units: number;
  lat: number | null;
  lng: number | null;
  /** Einzelne Hausnummern aus der Kartenauswahl. */
  numbers?: HouseNumberInput[];
}

export interface TerritoryDraft {
  name: string;
  city: string;
  postalCode: string;
  assignedUserId: number | null;
  note: string;
  dueDate: string | null;
  areaJson: string;
  streets: StreetInput[];
}

/**
 * Legt mehrere Gebiete auf einmal an - fuer ein Gebiet, das beim Anlegen auf
 * mehrere Leute aufgeteilt wird. Entweder entstehen alle oder keines: ein
 * halb aufgeteiltes Viertel waere schlimmer als gar keines.
 */
export function createTerritories(teamId: number, drafts: TerritoryDraft[], createdBy?: number): number[] {
  const db = getDb();
  const run = db.transaction(() => {
    const ids: number[] = [];
    for (const draft of drafts) {
      const id = createTerritory({ teamId, createdBy, ...draft });
      addStreetEntries(id, draft.streets);
      ids.push(id);
    }
    return ids;
  });
  return run();
}

/**
 * Haeuser, die schon zu einem anderen Gebiet des Teams gehoeren, nicht noch
 * einmal anlegen - sonst stuende dieselbe Tuer in zwei Gebieten bei zwei
 * Leuten. Das betrifft Haeuser in der Flaeche eines anderen Gebiets (die
 * Kartenvorschau einer Fuehrungskraft kennt fremde Flaechen nicht) und
 * Haeuser, die ein anderes Gebiet schon als Hausnummer hat (eine Strasse,
 * die beim Aufteilen ganz in das Nachbar-Teilgebiet ging).
 */
export function withoutTakenHouses(teamId: number, entries: StreetInput[], exceptTerritoryId = 0): StreetInput[] {
  const db = getDb();
  // Flaechen der anderen Gebiete, mit Rechteck drumherum: die meisten Haeuser liegen weit weg.
  const areas = (
    db.prepare("SELECT id, area_json FROM territories WHERE team_id = ? AND id <> ? AND area_json <> ''")
      .all(teamId, exceptTerritoryId) as Array<{ id: number; area_json: string }>
  ).flatMap((row) => {
    const shape = readShape(row.area_json);
    if (!shape) return [];
    const points = shape.flatMap(([outer]) => outer ?? []);
    const lats = points.map(([lat]) => lat);
    const lngs = points.map(([, lng]) => lng);
    return [{ shape, minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) }];
  });
  const inOtherArea = (lat: number, lng: number) =>
    areas.some(
      (a) => lat >= a.minLat && lat <= a.maxLat && lng >= a.minLng && lng <= a.maxLng && shapeContains(a.shape, [lat, lng]),
    );

  // Hausnummern anderer Gebiete je Strassenname - eine Abfrage pro Strasse, nicht pro Haus.
  const sameStreet = db.prepare(
    `SELECT lower(replace(h.number, ' ', '')) AS number, h.lat, h.lng FROM house_numbers h
       JOIN streets s ON s.id = h.street_id
       JOIN territories t ON t.id = s.territory_id
      WHERE t.team_id = ? AND t.id <> ? AND lower(s.name) = lower(?)
        AND h.lat IS NOT NULL AND h.lng IS NOT NULL`,
  );
  const twinsByStreet = new Map<string, Map<string, Array<{ lat: number; lng: number }>>>();
  const twinsOf = (name: string) => {
    const key = name.trim().toLowerCase();
    let twins = twinsByStreet.get(key);
    if (!twins) {
      twins = new Map();
      for (const row of sameStreet.all(teamId, exceptTerritoryId, name.trim()) as Array<{ number: string; lat: number; lng: number }>) {
        const list = twins.get(row.number) ?? [];
        list.push({ lat: row.lat, lng: row.lng });
        twins.set(row.number, list);
      }
      twinsByStreet.set(key, twins);
    }
    return twins;
  };
  // Gleicher Name und gleiche Nummer allein reicht nicht (Hauptstrasse 1 gibt es in jeder Stadt).
  const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    Math.hypot((a.lat - b.lat) * METERS_PER_DEGREE, (a.lng - b.lng) * METERS_PER_DEGREE * Math.cos((a.lat * Math.PI) / 180)) < 60;

  return entries.flatMap((entry) => {
    const numbers = entry.numbers ?? [];
    if (numbers.length === 0) return [entry];
    const kept = numbers.filter((house) => {
      if (house.lat === null || house.lng === null) return true;
      const point = { lat: house.lat, lng: house.lng };
      if (inOtherArea(point.lat, point.lng)) return false;
      const twins = twinsOf(entry.name).get(house.number.replace(/\s+/g, "").toLowerCase()) ?? [];
      return !twins.some((twin) => near(point, twin));
    });
    if (kept.length === numbers.length) return [entry];
    if (kept.length === 0) return [];
    return [{ ...entry, numbers: kept, units: kept.reduce((sum, house) => sum + Math.max(1, house.units), 0) }];
  });
}

/**
 * Strassen aus der Kartenauswahl uebernehmen - inklusive Koordinate und der
 * einzelnen Hausnummern, damit an der Tuer klar ist, welche Haeuser es gibt.
 *
 * Eine Strasse, die es im Gebiet schon gibt, wird nicht doppelt angelegt;
 * fehlen ihr aber die Hausnummern, werden sie nachgetragen. So bringt
 * "Straßen nachladen" auch alten Gebieten etwas.
 */
export function addStreetEntries(territoryId: number, entries: StreetInput[]): number {
  const db = getDb();
  const existingRows = db
    .prepare("SELECT id, name, house_numbers, units FROM streets WHERE territory_id = ?")
    .all(territoryId) as Array<{ id: number; name: string; house_numbers: string; units: number }>;
  const known = new Map(existingRows.map((r) => [r.name.toLocaleLowerCase("de-DE"), r]));
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM streets WHERE territory_id = ?")
    .get(territoryId) as { m: number };

  const insertStreet = db.prepare(
    `INSERT INTO streets (territory_id, name, house_numbers, units, sort_order, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertNumber = db.prepare(
    `INSERT INTO house_numbers (street_id, number, units, lat, lng, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(street_id, number) DO NOTHING`,
  );
  // Schreibweise egal, wie beim Erfassen: "21A" an der Tuer getippt ist dasselbe Haus wie "21a" aus der Karte.
  const sameNumber = db.prepare(
    "SELECT id FROM house_numbers WHERE street_id = ? AND lower(replace(number, ' ', '')) = lower(replace(?, ' ', '')) LIMIT 1",
  );
  const completeNumber = db.prepare(
    `UPDATE house_numbers SET lat = COALESCE(lat, ?), lng = COALESCE(lng, ?),
            units = CASE WHEN units > 1 THEN units ELSE ? END
      WHERE id = ?`,
  );
  const countNumbers = db.prepare(
    "SELECT COUNT(*) AS c FROM house_numbers WHERE street_id = ?",
  );
  const updateStreet = db.prepare(
    "UPDATE streets SET house_numbers = ?, units = ? WHERE id = ?",
  );

  const saveNumbers = (streetId: number, numbers: HouseNumberInput[]) => {
    for (const house of numbers) {
      const existing = sameNumber.get(streetId, house.number) as { id: number } | undefined;
      if (existing) {
        // Schon da (z. B. an der Tuer getippt): nur ergaenzen, was fehlt.
        completeNumber.run(house.lat, house.lng, house.units, existing.id);
        continue;
      }
      // Sortiert wird nach der Zahl im Namen: so liegt eine spaeter
      // nachgetragene 9 zwischen 7 und 11 und nicht am Ende.
      const numeric = Number.parseInt(house.number, 10);
      insertNumber.run(
        streetId,
        house.number,
        house.units,
        house.lat,
        house.lng,
        Number.isFinite(numeric) ? numeric : 0,
      );
    }
  };

  let order = maxOrder.m;
  let added = 0;
  const run = db.transaction(() => {
    for (const entry of entries) {
      const name = entry.name.trim();
      if (!name) continue;
      const numbers = entry.numbers ?? [];
      const existing = known.get(name.toLocaleLowerCase("de-DE"));

      if (existing) {
        // Schon da: nur ergaenzen, was fehlt - nie ueberschreiben. Neue
        // Hausnummern kommen dazu, vorhandene bleiben samt Reihenfolge stehen.
        if (numbers.length > 0) {
          const { c } = countNumbers.get(existing.id) as { c: number };
          saveNumbers(existing.id, numbers);
          if (c === 0) {
            updateStreet.run(
              existing.house_numbers || entry.houseNumbers,
              existing.units > 0 ? existing.units : entry.units,
              existing.id,
            );
          }
        }
        continue;
      }

      order += 1;
      added += 1;
      const result = insertStreet.run(
        territoryId,
        name,
        entry.houseNumbers,
        entry.units,
        order,
        entry.lat,
        entry.lng,
      );
      known.set(name.toLocaleLowerCase("de-DE"), {
        id: result.lastInsertRowid as number,
        name,
        house_numbers: entry.houseNumbers,
        units: entry.units,
      });
      saveNumbers(result.lastInsertRowid as number, numbers);
    }
  });
  run();
  return added;
}

export interface HouseNumberWithStats {
  id: number;
  street_id: number;
  number: string;
  units: number;
  lat: number | null;
  lng: number | null;
  sort_order: number;
  building_type: BuildingType;
  /** Erfasste Tueren an dieser Hausnummer, Klingeln eingerechnet. */
  visit_count: number;
  sale_count: number;
  /** Angelegte Klingelschilder - nur im Mehrfamilienhaus ueber 0. */
  bell_count: number;
  /** Davon abgearbeitet oder gesperrt. */
  bell_done_count: number;
  /** Erfolglose Versuche am Haus selbst, ohne die Klingeln. */
  not_home_count: number;
  /** Eintraege am Haus selbst, bei denen jemand an der Tuer war. */
  met_count: number;
  /** Letzter Eintrag an dieser Adresse - auch wenn er an einer Klingel hing. */
  last_visit_at: string | null;
  last_visit_user: string | null;
  /** Wer zuletzt hier war - fuer Name und Profilbild in der Liste. */
  last_visit_user_id: number | null;
  last_outcome: VisitOutcome | null;
  blocked_at: string | null;
  blocked_by: number | null;
  blocked_note: string;
  blocked_by_name: string | null;
}

/**
 * Trifft ein Besuch diese Hausnummer? Leerzeichen und Grossschreibung egal -
 * auf beiden Seiten: von Hand getippt steht auch "12 A" in der Liste.
 */
const HOUSE_MATCH =
  "v.street_id = h.street_id AND lower(replace(v.house_number, ' ', '')) = lower(replace(h.number, ' ', ''))";

/**
 * Hausnummern samt Bearbeitungsstand. Abgeglichen wird ueber den Text der
 * erfassten Hausnummer - Gross-/Kleinschreibung und Leerzeichen egal.
 */
export function listHouseNumbers(streetIds: number[]): HouseNumberWithStats[] {
  if (streetIds.length === 0) return [];
  const placeholders = streetIds.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT h.*,
              (SELECT COUNT(*) FROM visits v WHERE ${HOUSE_MATCH})        AS visit_count,
              (SELECT COUNT(*) FROM visits v
                WHERE ${HOUSE_MATCH} AND v.outcome = 'SALE')              AS sale_count,
              (SELECT COUNT(*) FROM visits v
                WHERE ${HOUSE_MATCH} AND v.doorbell_id IS NULL
                  AND v.outcome = 'NOT_HOME')                             AS not_home_count,
              (SELECT COUNT(*) FROM visits v
                WHERE ${HOUSE_MATCH} AND v.doorbell_id IS NULL
                  AND v.outcome <> 'NOT_HOME')                            AS met_count,
              (SELECT v.created_at FROM visits v WHERE ${HOUSE_MATCH}
                ORDER BY v.created_at DESC, v.id DESC LIMIT 1)            AS last_visit_at,
              (SELECT u.name FROM visits v JOIN users u ON u.id = v.user_id
                WHERE ${HOUSE_MATCH}
                ORDER BY v.created_at DESC, v.id DESC LIMIT 1)            AS last_visit_user,
              (SELECT v.user_id FROM visits v WHERE ${HOUSE_MATCH}
                ORDER BY v.created_at DESC, v.id DESC LIMIT 1)            AS last_visit_user_id,
              (SELECT v.outcome FROM visits v WHERE ${HOUSE_MATCH}
                ORDER BY v.created_at DESC, v.id DESC LIMIT 1)            AS last_outcome,
              (SELECT u.name FROM users u WHERE u.id = h.blocked_by)      AS blocked_by_name,
              (SELECT COUNT(*) FROM doorbells d
                WHERE d.house_number_id = h.id)                           AS bell_count,
              (SELECT COUNT(*) FROM doorbells d
                WHERE d.house_number_id = h.id AND ${BELL_DONE})          AS bell_done_count
         FROM house_numbers h
        WHERE h.street_id IN (${placeholders})
        ORDER BY h.street_id, h.sort_order, h.number`,
    )
    .all(...streetIds) as HouseNumberWithStats[];
}

/**
 * Nimmt eine eingefuegte Strassenliste entgegen. Jede Zeile ist eine Strasse,
 * optional mit Hausnummern und Wohneinheiten:
 *   Musterstrasse 1-45; 30 WE
 *   Bahnhofstr.
 */
export function addStreets(territoryId: number, raw: string): number {
  const db = getDb();
  const existing = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM streets WHERE territory_id = ?")
    .get(territoryId) as { m: number };
  // Wie bei der Kartenauswahl: eine Strasse, die es im Gebiet schon gibt, kommt nicht doppelt.
  const known = new Set(
    (db.prepare("SELECT name FROM streets WHERE territory_id = ?").all(territoryId) as Array<{ name: string }>)
      .map((row) => row.name.toLocaleLowerCase("de-DE")),
  );

  const insert = db.prepare(
    `INSERT INTO streets (territory_id, name, house_numbers, units, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let order = existing.m;
  let added = 0;
  const run = db.transaction(() => {
    for (const line of lines) {
      const parsed = parseStreetLine(line);
      const key = parsed.name.toLocaleLowerCase("de-DE");
      if (!parsed.name || known.has(key)) continue;
      known.add(key);
      order += 1;
      added += 1;
      insert.run(territoryId, parsed.name.slice(0, 120), parsed.houseNumbers, parsed.units, order);
    }
  });
  run();
  return added;
}

export function parseStreetLine(line: string): {
  name: string;
  houseNumbers: string;
  units: number;
} {
  // "Musterstrasse 1-45; 30 WE"  ->  Name / Hausnummern / Einheiten
  let rest = line;
  let units = 0;

  const unitMatch = rest.match(/[;,]\s*(\d+)\s*(?:WE|Einheiten|Wohnungen|Parteien)\b/i);
  if (unitMatch) {
    units = Number(unitMatch[1]);
    rest = rest.replace(unitMatch[0], "").trim();
  }

  const numberMatch = rest.match(/\s((?:\d+[a-zA-Z]?)(?:\s*[-–/]\s*\d+[a-zA-Z]?)?(?:\s*,\s*\d+[a-zA-Z]?)*)\s*$/);
  if (numberMatch) {
    return {
      name: rest.slice(0, numberMatch.index).trim().replace(/[;,]$/, ""),
      houseNumbers: numberMatch[1].trim(),
      units,
    };
  }
  return { name: rest.replace(/[;,]$/, "").trim(), houseNumbers: "", units };
}

/* =========================== Klingelschilder ============================ */

export interface DoorbellWithStats extends Doorbell {
  /** Erfasste Tueren an dieser Klingel. */
  visit_count: number;
  sale_count: number;
  /** Erfolglose Versuche - nach MAX_NOT_HOME_ATTEMPTS ist die Klingel durch. */
  not_home_count: number;
  /** Eintraege, bei denen jemand an der Tuer war. */
  met_count: number;
  /** Ergebnis des letzten Eintrags - fuer das Symbol in der Liste. */
  last_outcome: VisitOutcome | null;
  last_reason_emoji: string | null;
  last_visit_at: string | null;
  last_visit_user: string | null;
  /** Wer zuletzt an dieser Klingel war - fuer Name und Profilbild. */
  last_visit_user_id: number | null;
  blocked_by_name: string | null;
}

/** Klingelschilder mehrerer Haeuser auf einmal, in Reihenfolge des Klingelbretts. */
export function listDoorbells(houseNumberIds: number[]): DoorbellWithStats[] {
  if (houseNumberIds.length === 0) return [];
  const placeholders = houseNumberIds.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT d.*,
              (SELECT COUNT(*) FROM visits v WHERE v.doorbell_id = d.id) AS visit_count,
              (SELECT COUNT(*) FROM visits v
                WHERE v.doorbell_id = d.id AND v.outcome = 'SALE')        AS sale_count,
              (SELECT COUNT(*) FROM visits v
                WHERE v.doorbell_id = d.id AND v.outcome = 'NOT_HOME')    AS not_home_count,
              (SELECT COUNT(*) FROM visits v
                WHERE v.doorbell_id = d.id AND v.outcome <> 'NOT_HOME')   AS met_count,
              (SELECT v.outcome FROM visits v WHERE v.doorbell_id = d.id
                ORDER BY v.created_at DESC, v.id DESC LIMIT 1)            AS last_outcome,
              (SELECT r.emoji FROM visits v
                 LEFT JOIN rejection_reasons r ON r.id = v.reason_id
                WHERE v.doorbell_id = d.id
                ORDER BY v.created_at DESC, v.id DESC LIMIT 1)            AS last_reason_emoji,
              (SELECT v.created_at FROM visits v WHERE v.doorbell_id = d.id
                ORDER BY v.created_at DESC, v.id DESC LIMIT 1)            AS last_visit_at,
              (SELECT u.name FROM visits v JOIN users u ON u.id = v.user_id
                WHERE v.doorbell_id = d.id
                ORDER BY v.created_at DESC, v.id DESC LIMIT 1)            AS last_visit_user,
              (SELECT v.user_id FROM visits v WHERE v.doorbell_id = d.id
                ORDER BY v.created_at DESC, v.id DESC LIMIT 1)            AS last_visit_user_id,
              (SELECT u.name FROM users u WHERE u.id = d.blocked_by)      AS blocked_by_name
         FROM doorbells d
        WHERE d.house_number_id IN (${placeholders})
        ORDER BY d.house_number_id, d.sort_order, d.id`,
    )
    .all(...houseNumberIds) as DoorbellWithStats[];
}

/**
 * Die Hausnummer einer Strasse holen und notfalls anlegen.
 *
 * Gebraucht fuer von Hand getippte Nummern, die OpenStreetMap nicht kennt.
 * Gesucht wird so unscharf wie an anderer Stelle verglichen wird, damit
 * "12 A" nicht neben der vorhandenen "12a" landet.
 */
export function ensureHouseNumber(streetId: number, number: string): number {
  const db = getDb();
  const found = db
    .prepare(
      `SELECT id FROM house_numbers
        WHERE street_id = ?
          AND lower(replace(number, ' ', '')) = lower(replace(?, ' ', ''))`,
    )
    .get(streetId, number) as { id: number } | undefined;
  if (found) return found.id;

  const numeric = Number.parseInt(number, 10);
  db.prepare(
    `INSERT INTO house_numbers (street_id, number, units, sort_order)
     VALUES (?, ?, 0, ?)
     ON CONFLICT(street_id, number) DO NOTHING`,
  ).run(streetId, number, Number.isFinite(numeric) ? numeric : 0);

  const row = db
    .prepare("SELECT id FROM house_numbers WHERE street_id = ? AND number = ?")
    .get(streetId, number) as { id: number } | undefined;
  if (!row) throw new Error("Hausnummer konnte nicht angelegt werden.");
  return row.id;
}

export function setBuildingType(houseNumberId: number, type: BuildingType): void {
  getDb()
    .prepare("UPDATE house_numbers SET building_type = ? WHERE id = ?")
    .run(type, houseNumberId);
}

/**
 * Klingelschilder anlegen, was noch fehlt.
 *
 * Verglichen wird ueber den Namen - derselbe Massstab wie in der Oberflaeche.
 * Ein Schild, das offline und online gleichzeitig entsteht, bleibt damit eins.
 */
export function addDoorbells(houseNumberId: number, entries: DoorbellInput[]): number {
  if (entries.length === 0) return 0;
  const db = getDb();
  const existing = db
    .prepare("SELECT label FROM doorbells WHERE house_number_id = ?")
    .all(houseNumberId) as Array<{ label: string }>;
  const taken = new Set(existing.map((row) => bellKey(row.label)));

  const insert = db.prepare(
    `INSERT INTO doorbells (house_number_id, label, floor, sort_order)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(house_number_id, label) DO NOTHING`,
  );
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM doorbells WHERE house_number_id = ?")
    .get(houseNumberId) as { m: number };

  let order = maxOrder.m;
  let total = existing.length;
  let added = 0;
  const run = db.transaction(() => {
    for (const entry of entries) {
      const label = normalizeLabel(entry.label);
      if (!label) continue;
      const key = bellKey(label);
      if (taken.has(key)) continue;
      if (total >= MAX_BELLS_PER_HOUSE) break;
      taken.add(key);
      order += 1;
      total += 1;
      added += 1;
      insert.run(houseNumberId, label, normalizeFloor(entry.floor), order);
    }
  });
  run();
  return added;
}

/** Eine einzelne Klingel holen und notfalls anlegen - fuer nachgesendete Eintraege. */
export function ensureDoorbell(houseNumberId: number, label: string, floor = ""): number {
  const clean = normalizeLabel(label);
  if (!clean) throw new Error("Klingelschild ohne Namen.");
  const db = getDb();
  const rows = db
    .prepare("SELECT id, label FROM doorbells WHERE house_number_id = ?")
    .all(houseNumberId) as Array<{ id: number; label: string }>;
  const hit = rows.find((row) => bellKey(row.label) === bellKey(clean));
  if (hit) return hit.id;

  addDoorbells(houseNumberId, [{ label: clean, floor: normalizeFloor(floor) }]);
  const row = db
    .prepare("SELECT id FROM doorbells WHERE house_number_id = ? AND label = ?")
    .get(houseNumberId, clean) as { id: number } | undefined;
  if (!row) throw new Error("Klingelschild konnte nicht angelegt werden.");
  return row.id;
}

/** Prueft, dass die Klingel ueber Haus, Strasse und Gebiet zum Team gehoert. */
export function requireTeamDoorbell(
  doorbellId: number,
  teamId: number,
): Doorbell & { visit_count: number } {
  const row = getDb()
    .prepare(
      `SELECT d.*,
              (SELECT COUNT(*) FROM visits v WHERE v.doorbell_id = d.id) AS visit_count
         FROM doorbells d
         JOIN house_numbers h ON h.id = d.house_number_id
         JOIN streets s       ON s.id = h.street_id
         JOIN territories t   ON t.id = s.territory_id
        WHERE d.id = ? AND t.team_id = ?`,
    )
    .get(doorbellId, teamId) as (Doorbell & { visit_count: number }) | undefined;
  if (!row) throw new Error("Klingelschild nicht gefunden.");
  return row;
}

export function updateDoorbell(
  doorbellId: number,
  input: { label?: string; floor?: string },
): void {
  const db = getDb();
  const fields: string[] = [];
  const values: string[] = [];
  if (input.label !== undefined) {
    const label = normalizeLabel(input.label);
    if (!label) throw new Error("Das Klingelschild braucht einen Namen.");
    // Ohne diese Pruefung schluege die Eindeutigkeit der Tabelle zu und der
    // Vertriebler bekaeme an der Tuer eine SQL-Meldung zu lesen.
    const siblings = db
      .prepare(
        `SELECT id, label FROM doorbells
          WHERE house_number_id = (SELECT house_number_id FROM doorbells WHERE id = ?)`,
      )
      .all(doorbellId) as Array<{ id: number; label: string }>;
    const taken = siblings.some(
      (row) => row.id !== doorbellId && bellKey(row.label) === bellKey(label),
    );
    if (taken) throw new Error(`„${label}“ steht schon an diesem Klingelbrett.`);
    fields.push("label = ?");
    values.push(label);
  }
  if (input.floor !== undefined) {
    fields.push("floor = ?");
    values.push(normalizeFloor(input.floor));
  }
  if (fields.length === 0) return;
  db.prepare(`UPDATE doorbells SET ${fields.join(", ")} WHERE id = ?`).run(...values, doorbellId);
}

export function deleteDoorbell(doorbellId: number): void {
  getDb().prepare("DELETE FROM doorbells WHERE id = ?").run(doorbellId);
}

/**
 * Tuer sperren oder wieder freigeben.
 *
 * userId gesetzt = sperren, null = freigeben. Der Tabellenname kommt aus einer
 * festen Auswahl, nicht aus einer Eingabe.
 */
export function setDoorBlocked(
  table: "house_numbers" | "doorbells",
  id: number,
  userId: number | null,
  note = "",
): void {
  const db = getDb();
  if (userId === null) {
    db.prepare(
      `UPDATE ${table} SET blocked_at = NULL, blocked_by = NULL, blocked_note = '' WHERE id = ?`,
    ).run(id);
    return;
  }
  db.prepare(
    `UPDATE ${table}
        SET blocked_at = datetime('now'), blocked_by = ?, blocked_note = ?
      WHERE id = ?`,
  ).run(userId, note, id);
}

/** Ist diese Tuer gesperrt? Wird vor jedem Eintrag geprueft, auch beim Nachsenden. */
export function doorBlocked(
  table: "house_numbers" | "doorbells",
  id: number,
): boolean {
  const row = getDb()
    .prepare(`SELECT blocked_at FROM ${table} WHERE id = ?`)
    .get(id) as { blocked_at: string | null } | undefined;
  return Boolean(row?.blocked_at);
}

/** Prueft, dass die Strasse ueber ihr Gebiet zum Team gehoert. */
/**
 * Hat die Person an dieser Tuer einen eigenen offenen Termin? Dann darf sie
 * dort erfassen, auch wenn das Gebiet inzwischen jemand anderem gehoert
 * (Uebergabe mit "Termine bleiben") - sonst liesse sich der Termin nur noch
 * abhaken, nie in den Abschluss verwandeln, fuer den er vereinbart wurde.
 *
 * Tuer heisst im Mehrfamilienhaus: die Klingel des Termins (auch wenn sie
 * inzwischen umbenannt wurde), nicht das ganze Haus des neuen Besitzers.
 */
export function ownsAppointmentAt(user: User, streetId: number | null, houseNumber: string, doorbellLabel = ""): boolean {
  if (streetId === null || !houseNumber.trim()) return false;
  const rows = getDb()
    .prepare(
      `SELECT d.label AS bell FROM visits v
         LEFT JOIN doorbells d ON d.id = v.doorbell_id
        WHERE v.team_id = ? AND v.street_id = ? AND v.outcome = 'APPOINTMENT'
          AND v.follow_up_done_at IS NULL AND COALESCE(v.follow_up_user_id, v.user_id) = ?
          AND lower(replace(v.house_number, ' ', '')) = lower(replace(?, ' ', ''))`,
    )
    .all(user.team_id, streetId, user.id, houseNumber) as Array<{ bell: string | null }>;
  return rows.some((row) => row.bell === null || (doorbellLabel !== "" && bellKey(row.bell) === bellKey(doorbellLabel)));
}

/**
 * Gesperrte Tueren ("Nicht klingeln") einer Strasse oder eines Gebiets. Die
 * Sperre haengt an der Hausnummer bzw. Klingel - wird die Strasse geloescht,
 * ist sie weg, und nach dem erneuten Anlegen darf wieder geklingelt werden.
 */
export function blockedDoorCount(scope: { streetId: number } | { territoryId: number }): number {
  const [where, id] =
    "streetId" in scope ? ["s.id = ?", scope.streetId] : ["s.territory_id = ?", scope.territoryId];
  const row = getDb()
    .prepare(
      `SELECT (SELECT COUNT(*) FROM house_numbers h JOIN streets s ON s.id = h.street_id
                WHERE ${where} AND h.blocked_at IS NOT NULL)
            + (SELECT COUNT(*) FROM doorbells d JOIN house_numbers h ON h.id = d.house_number_id
                 JOIN streets s ON s.id = h.street_id
                WHERE ${where} AND d.blocked_at IS NOT NULL) AS c`,
    )
    .get(id, id) as { c: number };
  return row.c;
}

export function requireTeamStreet(
  streetId: number,
  teamId: number,
): { id: number; territory_id: number } {
  const row = getDb()
    .prepare(
      `SELECT s.id, s.territory_id FROM streets s
         JOIN territories t ON t.id = s.territory_id
        WHERE s.id = ? AND t.team_id = ?`,
    )
    .get(streetId, teamId) as { id: number; territory_id: number } | undefined;
  if (!row) throw new Error("Straße nicht gefunden.");
  return row;
}

/* ========================== Ablehnungsgruende =========================== */

export const DEFAULT_REASONS: Array<Omit<RejectionReason, "id" | "team_id">> = [
  { code: "ZUFRIEDEN", label: "Zufrieden mit Anbieter", emoji: "🙂", hint: "Kunde will nicht wechseln", sort_order: 1, active: 1 },
  { code: "KEIN_INTERESSE", label: "Kein Interesse", emoji: "🚫", hint: "Grundsätzliche Ablehnung", sort_order: 2, active: 1 },
  { code: "KEINE_ZEIT", label: "Keine Zeit", emoji: "⏱️", hint: "Gerade ungelegen", sort_order: 3, active: 1 },
  { code: "PARTNER", label: "Muss mit Partner sprechen", emoji: "👫", hint: "Entscheider nicht da", sort_order: 4, active: 1 },
  { code: "VERTRAG_LAEUFT", label: "Vertrag läuft noch", emoji: "📆", hint: "Kündigungsfrist / Laufzeit", sort_order: 5, active: 1 },
  { code: "SCHON_GEWECHSELT", label: "Gerade gewechselt", emoji: "🔁", hint: "Kürzlich neuer Vertrag", sort_order: 6, active: 1 },
  { code: "ZU_TEUER", label: "Sieht keine Ersparnis", emoji: "💶", hint: "Preis überzeugt nicht", sort_order: 7, active: 1 },
  { code: "KEINE_HAUSTUER", label: "Keine Haustürgeschäfte", emoji: "🚪", hint: "Grundsätzlich nichts an der Tür", sort_order: 8, active: 1 },
  { code: "UNTERLAGEN", label: "Unterlagen fehlen", emoji: "📄", hint: "Letzte Abrechnung nicht zur Hand", sort_order: 9, active: 1 },
  { code: "MIETER", label: "Mieter / entscheidet nicht", emoji: "🔑", hint: "Vermieter oder WEG entscheidet", sort_order: 10, active: 1 },
  { code: "SCHLECHTE_ERFAHRUNG", label: "Schlechte Erfahrung", emoji: "😠", hint: "Ärger bei früherem Wechsel", sort_order: 11, active: 1 },
  { code: "SPRACHE", label: "Sprachbarriere", emoji: "🗣️", hint: "Verständigung nicht möglich", sort_order: 12, active: 1 },
  { code: "SONSTIGES", label: "Sonstiges", emoji: "✏️", hint: "Freitext eintragen", sort_order: 13, active: 1 },
];

export function ensureDefaultReasons(teamId: number): void {
  const db = getDb();
  const count = db
    .prepare("SELECT COUNT(*) AS c FROM rejection_reasons WHERE team_id = ?")
    .get(teamId) as { c: number };
  if (count.c > 0) return;
  const insert = db.prepare(
    `INSERT INTO rejection_reasons (team_id, code, label, emoji, hint, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const run = db.transaction(() => {
    for (const r of DEFAULT_REASONS) {
      insert.run(teamId, r.code, r.label, r.emoji, r.hint, r.sort_order, r.active);
    }
  });
  run();
}

/**
 * Code fuer einen neuen Ablehnungsgrund - im Team eindeutig. Aus der hoechsten
 * Sortierung allein waere er das nicht: nach dem Umsortieren kaeme dieselbe
 * Nummer noch einmal, und das Anlegen scheiterte an der Datenbank.
 */
export function reasonCode(teamId: number, label: string, wanted: string, next: number): string {
  const taken = new Set(
    (getDb().prepare("SELECT code FROM rejection_reasons WHERE team_id = ?").all(teamId) as Array<{ code: string }>)
      .map((row) => row.code),
  );
  const own = wanted.trim().toUpperCase();
  if (own) {
    if (taken.has(own)) throw new Error("Diesen Code gibt es schon.");
    return own;
  }
  const stem = label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 30);
  let suffix = Math.max(1, Math.floor(next));
  while (taken.has(`${stem}_${suffix}`)) suffix += 1;
  return `${stem}_${suffix}`;
}

export function listReasons(teamId: number, onlyActive = true): RejectionReason[] {
  ensureDefaultReasons(teamId);
  return getDb()
    .prepare(
      `SELECT * FROM rejection_reasons
        WHERE team_id = ? ${onlyActive ? "AND active = 1" : ""}
        ORDER BY sort_order, label`,
    )
    .all(teamId) as RejectionReason[];
}

/* =============================== Besuche ================================ */

export function createVisit(input: {
  teamId: number;
  userId: number;
  territoryId: number | null;
  streetId: number | null;
  houseNumber: string;
  doorbellId: number | null;
  outcome: VisitOutcome;
  reasonId: number | null;
  reasonNote: string;
  energyType: "" | "STROM" | "GAS" | "BEIDES";
  followUpAt: string | null;
  contactName?: string;
  contactPhone?: string;
  lat: number | null;
  lng: number | null;
  /** Wann an der Tuer erfasst (ohne Netz nachgesendet), als SQLite-Zeitstempel in UTC. */
  recordedAt?: string | null;
}): number {
  const db = getDb();
  const recordedAt = input.recordedAt ?? null;
  const result = db
    .prepare(
      `INSERT INTO visits
         (team_id, user_id, territory_id, street_id, house_number, doorbell_id, outcome,
          reason_id, reason_note, energy_type, follow_up_at, contact_name, contact_phone,
          lat, lng, created_at, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')),
               CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END)`,
    )
    .run(
      input.teamId,
      input.userId,
      input.territoryId,
      input.streetId,
      input.houseNumber,
      input.doorbellId,
      input.outcome,
      input.reasonId,
      input.reasonNote,
      input.energyType,
      input.followUpAt,
      input.contactName ?? "",
      input.contactPhone ?? "",
      input.lat,
      input.lng,
      recordedAt,
      recordedAt,
    );

  // Ein Abschluss kommt als Beitrag in den Feed - dort gratuliert das Team.
  if (input.outcome === "SALE") {
    db.prepare(
      `INSERT INTO posts (team_id, user_id, kind, visit_id, created_at)
       SELECT team_id, user_id, 'SALE', id, created_at FROM visits WHERE id = ?`,
    ).run(result.lastInsertRowid);
  }

  // Strasse und Gebiet automatisch auf "in Arbeit" setzen
  if (input.streetId) {
    db.prepare(
      "UPDATE streets SET status = 'ACTIVE' WHERE id = ? AND status = 'OPEN'",
    ).run(input.streetId);
  }
  if (input.territoryId) {
    db.prepare(
      "UPDATE territories SET status = 'ACTIVE' WHERE id = ? AND status = 'OPEN'",
    ).run(input.territoryId);
  }
  return result.lastInsertRowid as number;
}

export interface VisitRow {
  id: number;
  created_at: string;
  outcome: VisitOutcome;
  house_number: string;
  reason_note: string;
  energy_type: string;
  follow_up_at: string | null;
  user_name: string;
  street_name: string | null;
  territory_name: string | null;
  reason_label: string | null;
  reason_emoji: string | null;
}

export function listVisits(
  teamId: number,
  opts: { userId?: number; territoryId?: number; limit?: number; since?: string } = {},
): VisitRow[] {
  const where: string[] = ["v.team_id = ?"];
  const params: (string | number)[] = [teamId];
  if (opts.userId) {
    where.push("v.user_id = ?");
    params.push(opts.userId);
  }
  if (opts.territoryId) {
    where.push("v.territory_id = ?");
    params.push(opts.territoryId);
  }
  if (opts.since) {
    where.push("v.created_at >= ?");
    params.push(opts.since);
  }
  params.push(opts.limit ?? 100);

  return getDb()
    .prepare(
      `SELECT v.id, v.created_at, v.outcome, v.house_number, v.reason_note,
              v.energy_type, v.follow_up_at,
              u.name AS user_name,
              s.name AS street_name,
              t.name AS territory_name,
              r.label AS reason_label,
              r.emoji AS reason_emoji
         FROM visits v
         JOIN users u ON u.id = v.user_id
         LEFT JOIN streets s ON s.id = v.street_id
         LEFT JOIN territories t ON t.id = v.territory_id
         LEFT JOIN rejection_reasons r ON r.id = v.reason_id
        WHERE ${where.join(" AND ")}
        ORDER BY v.created_at DESC
        LIMIT ?`,
    )
    .all(...params) as VisitRow[];
}

/* ================================ Termine =============================== */

export interface AppointmentRow {
  id: number;
  created_at: string;
  follow_up_at: string;
  follow_up_done_at: string | null;
  contact_name: string;
  contact_phone: string;
  reason_note: string;
  energy_type: string;
  house_number: string;
  user_id: number;
  user_name: string;
  street_id: number | null;
  street_name: string | null;
  lat: number | null;
  lng: number | null;
  territory_name: string | null;
  doorbell_label: string | null;
}

/** Die Hausnummer eines Termins mit bekannter Lage - Schreibweise egal. */
const APPOINTMENT_HOUSE = `h.street_id = v.street_id
  AND lower(replace(h.number, ' ', '')) = lower(replace(v.house_number, ' ', ''))
  AND h.lat IS NOT NULL AND h.lng IS NOT NULL LIMIT 1`;

/**
 * Vereinbarte Termine. Offene: die kommenden zuerst (der naechste vorn),
 * danach die ueberfaelligen, der juengste zuerst - sonst
 * fuellten Termine von vor Monaten, die nie abgehakt wurden, das ganze Limit
 * und die von heute fehlten. Mit `done` die erledigten, der juengste zuerst;
 * getrennt abgefragt, damit sich beide nicht das Limit teilen.
 *
 * `from`/`before` grenzen nach Ortszeit ein ("2026-10-16" = ab diesem Tag).
 * Sortiert wird ueber den Text der Ortszeit - "2026-09-21 18:00" laesst sich
 * genauso vergleichen wie ein Datum, und die Reihenfolge bleibt dieselbe.
 */
export function listAppointments(
  teamId: number,
  opts: { userId?: number; done?: boolean; limit?: number; from?: string; before?: string; now?: Date } = {},
): AppointmentRow[] {
  const where: string[] = [
    // Mit Person: "+" haelt SQLite vom Teamindex fern - der Index je Person ist viel enger.
    opts.userId ? "+v.team_id = ?" : "v.team_id = ?",
    "v.outcome = 'APPOINTMENT'",
    "v.follow_up_at IS NOT NULL",
  ];
  const params: (string | number)[] = [teamId];
  if (opts.userId) {
    where.push("COALESCE(v.follow_up_user_id, v.user_id) = ?");
    params.push(opts.userId);
  }
  where.push(opts.done ? "v.follow_up_done_at IS NOT NULL" : "v.follow_up_done_at IS NULL");
  if (opts.from) {
    where.push("v.follow_up_at >= ?");
    params.push(opts.from);
  }
  if (opts.before) {
    where.push("v.follow_up_at < ?");
    params.push(opts.before);
  }
  // Geteilt am jetzigen Moment: was noch kommt, der naechste vorn - danach das Vorbeigegangene, das juengste vorn.
  const now = berlinSlot(opts.now);
  const order = opts.done
    ? "v.follow_up_at DESC, v.id"
    : `CASE WHEN v.follow_up_at >= '${now}' THEN 0 ELSE 1 END,
       CASE WHEN v.follow_up_at >= '${now}' THEN v.follow_up_at END ASC,
       v.follow_up_at DESC, v.id`;
  params.push(opts.limit ?? 100);

  /*
   * Offene: erst auswaehlen, dann die Details (Lage des Hauses) nur fuer die
   * gewaehlten rechnen - die Sortierung "heute zuerst" braucht alle offenen.
   * Erledigte kommen in Indexreihenfolge, da reicht das LIMIT allein.
   */
  const pick = opts.done
    ? `SELECT v.id, row_number() OVER (ORDER BY ${order}) AS position FROM (
         SELECT v.id, v.follow_up_at FROM visits v WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?
       ) v`
    : `SELECT v.id, row_number() OVER (ORDER BY ${order}) AS position
         FROM visits v
        WHERE ${where.join(" AND ")}
        ORDER BY position
        LIMIT ?`;
  return getDb()
    .prepare(
      `WITH pick AS (${pick})
       SELECT v.id, v.created_at, v.follow_up_at, v.follow_up_done_at,
              v.contact_name, v.contact_phone, v.reason_note, v.energy_type,
              v.house_number, COALESCE(v.follow_up_user_id, v.user_id) AS user_id,
              u.name AS user_name,
              s.id   AS street_id,
              s.name AS street_name,
              -- Fuer die Route: zuerst die Lage des Hauses selbst, dann wo erfasst wurde, dann die Strasse.
              COALESCE((SELECT h.lat FROM house_numbers h WHERE ${APPOINTMENT_HOUSE}),
                       v.lat, s.lat) AS lat,
              COALESCE((SELECT h.lng FROM house_numbers h WHERE ${APPOINTMENT_HOUSE}),
                       v.lng, s.lng) AS lng,
              t.name AS territory_name,
              d.label AS doorbell_label
         FROM pick
         JOIN visits v ON v.id = pick.id
         JOIN users u ON u.id = COALESCE(v.follow_up_user_id, v.user_id)
         LEFT JOIN streets s ON s.id = v.street_id
         LEFT JOIN territories t ON t.id = v.territory_id
         LEFT JOIN doorbells d ON d.id = v.doorbell_id
        ORDER BY pick.position`,
    )
    .all(...params) as AppointmentRow[];
}

/** Wie viele Termine es wirklich gibt - die Listen sind begrenzt. */
export function countAppointments(
  teamId: number,
  opts: { userId?: number; now?: Date } = {},
): { open: number; overdue: number; done: number } {
  const base = `${opts.userId ? "+v.team_id" : "v.team_id"} = ? AND v.outcome = 'APPOINTMENT' AND v.follow_up_at IS NOT NULL`;
  const scope = opts.userId ? " AND COALESCE(v.follow_up_user_id, v.user_id) = ?" : "";
  const args = opts.userId ? [teamId, opts.userId] : [teamId];
  return getDb()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM visits v WHERE ${base}${scope} AND v.follow_up_done_at IS NULL) AS open,
         (SELECT COUNT(*) FROM visits v WHERE ${base}${scope} AND v.follow_up_done_at IS NULL
            AND v.follow_up_at < ?) AS overdue,
         (SELECT COUNT(*) FROM visits v WHERE ${base}${scope} AND v.follow_up_done_at IS NOT NULL) AS done`,
    )
    .get(...args, ...args, berlinSlot(opts.now), ...args) as { open: number; overdue: number; done: number };
}

/** Termin abhaken oder wieder oeffnen. */
export function setAppointmentDone(visitId: number, done: boolean): void {
  getDb()
    .prepare(
      `UPDATE visits SET follow_up_done_at = ${done ? "datetime('now')" : "NULL"}
        WHERE id = ?`,
    )
    .run(visitId);
}

/** Termin umlegen - der Kunde hat eine andere Zeit genannt. */
export function setAppointmentSlot(visitId: number, slot: string, zone = "Europe/Berlin"): void {
  getDb()
    .prepare("UPDATE visits SET follow_up_at = ?, follow_up_timezone = ?, follow_up_utc = ?, follow_up_done_at = NULL WHERE id = ?")
    .run(slot, zone, appointmentUtc(slot, zone), visitId);
}

/** Prueft, dass der Eintrag zum Team gehoert - und wem er gehoert. */
export function requireTeamVisit(
  visitId: number,
  teamId: number,
): { id: number; user_id: number; outcome: VisitOutcome } {
  const row = getDb()
    .prepare("SELECT id, COALESCE(follow_up_user_id, user_id) AS user_id, outcome FROM visits WHERE id = ? AND team_id = ?")
    .get(visitId, teamId) as
    | { id: number; user_id: number; outcome: VisitOutcome }
    | undefined;
  if (!row) throw new Error("Eintrag nicht gefunden.");
  return row;
}

/* ============================== Auswertung ============================== */

export interface Totals {
  doors: number;
  met: number;
  sales: number;
  appointments: number;
  not_home: number;
}

export function totals(
  teamId: number,
  opts: { userId?: number; since?: string; until?: string } = {},
): Totals {
  const where: string[] = ["team_id = ?"];
  const params: (string | number)[] = [teamId];
  if (opts.userId) {
    where.push("user_id = ?");
    params.push(opts.userId);
  }
  if (opts.since) {
    where.push("created_at >= ?");
    params.push(opts.since);
  }
  if (opts.until) {
    where.push("created_at < ?");
    params.push(opts.until);
  }
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS doors,
              SUM(outcome IN ('MET_NO_SALE','APPOINTMENT','SALE')) AS met,
              SUM(outcome = 'SALE')        AS sales,
              SUM(outcome = 'APPOINTMENT') AS appointments,
              SUM(outcome = 'NOT_HOME')    AS not_home
         FROM visits WHERE ${where.join(" AND ")}`,
    )
    .get(...params) as Totals;
}

export interface MemberStats extends Totals {
  user_id: number;
  user_name: string;
  role: string;
}

export function memberStats(teamId: number, since?: string): MemberStats[] {
  // Parameter-Reihenfolge: erst der optionale Zeitfilter im JOIN, dann die Team-ID im WHERE.
  const joinFilter = since ? "AND v.created_at >= ?" : "";
  const params: (string | number)[] = since ? [since, teamId] : [teamId];
  return getDb()
    .prepare(
      `SELECT u.id AS user_id, u.name AS user_name, u.role,
              COUNT(v.id) AS doors,
              COALESCE(SUM(v.outcome IN ('MET_NO_SALE','APPOINTMENT','SALE')), 0) AS met,
              COALESCE(SUM(v.outcome = 'SALE'), 0)        AS sales,
              COALESCE(SUM(v.outcome = 'APPOINTMENT'), 0) AS appointments,
              COALESCE(SUM(v.outcome = 'NOT_HOME'), 0)    AS not_home
         FROM users u
         LEFT JOIN visits v ON v.user_id = u.id ${joinFilter}
        WHERE u.team_id = ? AND u.active = 1
        GROUP BY u.id
        ORDER BY sales DESC, met DESC, u.name`,
    )
    .all(...params) as MemberStats[];
}

export interface ReasonStat {
  id: number;
  label: string;
  emoji: string;
  count: number;
}

export function reasonStats(teamId: number, since?: string, userId?: number): ReasonStat[] {
  let joinFilter = "AND v.team_id = ?";
  const params: (string | number)[] = [teamId];
  if (since) { joinFilter += " AND v.created_at >= ?"; params.push(since); }
  if (userId !== undefined) { joinFilter += " AND v.user_id = ?"; params.push(userId); }
  params.push(teamId);
  return getDb()
    .prepare(
      `SELECT r.id, r.label, r.emoji, COUNT(v.id) AS count
         FROM rejection_reasons r
         LEFT JOIN visits v ON v.reason_id = r.id ${joinFilter}
        WHERE r.team_id = ?
        GROUP BY r.id
       HAVING count > 0
        ORDER BY count DESC`,
    )
    .all(...params) as ReasonStat[];
}

/** Tagesverlauf der letzten n Tage fuer das Balkendiagramm. */
export function dailySeries(
  teamId: number,
  days: number,
  userId?: number,
): Array<{ day: string; doors: number; met: number; sales: number }> {
  const params: (string | number)[] = [teamId];
  let extra = "";
  if (userId) {
    extra = "AND user_id = ?";
    params.push(userId);
  }
  params.push(`-${days} days`);
  return getDb()
    .prepare(
      `SELECT date(created_at) AS day,
              COUNT(*) AS doors,
              SUM(outcome IN ('MET_NO_SALE','APPOINTMENT','SALE')) AS met,
              SUM(outcome = 'SALE') AS sales
         FROM visits
        WHERE team_id = ? ${extra} AND created_at >= date('now', ?)
        GROUP BY day ORDER BY day`,
    )
    .all(...params) as Array<{ day: string; doors: number; met: number; sales: number }>;
}

/* ============================ Energiepreise ============================= */

export function listEnergyPrices(): EnergyPrice[] {
  return getDb()
    .prepare("SELECT * FROM energy_prices ORDER BY postal_code")
    .all() as EnergyPrice[];
}

export function lastRefresh(): {
  finished_at: string | null;
  status: string;
  source: string;
  row_count: number;
  message: string;
  /** Wann die Daten zuletzt erfolgreich kamen - ein laufender Abruf hat noch kein Ende. */
  success_at: string | null;
} | null {
  const row = getDb()
    .prepare(
      `SELECT finished_at, status, source, row_count, message,
              (SELECT finished_at FROM energy_refresh_log WHERE status = 'ok' ORDER BY id DESC LIMIT 1) AS success_at
         FROM energy_refresh_log ORDER BY id DESC LIMIT 1`,
    )
    .get() as
    | { finished_at: string | null; status: string; source: string; row_count: number; message: string; success_at: string | null }
    | undefined;
  return row ?? null;
}
