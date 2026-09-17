import { getDb } from "./db";
import type {
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
      `SELECT id, team_id, name, email, role, phone, active, created_at
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
}

const TERRITORY_STATS_SQL = `
  SELECT t.*,
         u.name AS assignee_name,
         (SELECT COUNT(*) FROM streets s WHERE s.territory_id = t.id)              AS street_count,
         (SELECT COALESCE(SUM(s.units), 0) FROM streets s WHERE s.territory_id = t.id) AS unit_count,
         (SELECT COUNT(*) FROM visits v WHERE v.territory_id = t.id)               AS visit_count,
         (SELECT COUNT(*) FROM visits v WHERE v.territory_id = t.id
            AND v.outcome IN ('MET_NO_SALE','APPOINTMENT','SALE'))                 AS met_count,
         (SELECT COUNT(*) FROM visits v WHERE v.territory_id = t.id
            AND v.outcome = 'SALE')                                                AS sale_count
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
}): number {
  const result = getDb()
    .prepare(
      `INSERT INTO territories
         (team_id, name, city, postal_code, assigned_user_id, note, due_date, status, area_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    );
  return result.lastInsertRowid as number;
}

/** Gezeichnete Flaeche eines bestehenden Gebiets ersetzen. */
export function setTerritoryArea(territoryId: number, areaJson: string): void {
  getDb().prepare("UPDATE territories SET area_json = ? WHERE id = ?").run(areaJson, territoryId);
}

export interface StreetInput {
  name: string;
  houseNumbers: string;
  units: number;
  lat: number | null;
  lng: number | null;
}

/**
 * Strassen aus der Kartenauswahl uebernehmen - inklusive Koordinate, damit sie
 * spaeter auf der Gebietskarte zu sehen sind. Bereits vorhandene Strassen des
 * Gebiets werden uebersprungen, doppelte Eintraege gibt es also nicht.
 */
export function addStreetEntries(territoryId: number, entries: StreetInput[]): number {
  const db = getDb();
  const existingRows = db
    .prepare("SELECT name FROM streets WHERE territory_id = ?")
    .all(territoryId) as Array<{ name: string }>;
  const known = new Set(existingRows.map((r) => r.name.toLocaleLowerCase("de-DE")));
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM streets WHERE territory_id = ?")
    .get(territoryId) as { m: number };

  const insert = db.prepare(
    `INSERT INTO streets (territory_id, name, house_numbers, units, sort_order, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  let order = maxOrder.m;
  let added = 0;
  const run = db.transaction(() => {
    for (const entry of entries) {
      const name = entry.name.trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase("de-DE");
      if (known.has(key)) continue;
      known.add(key);
      order += 1;
      added += 1;
      insert.run(
        territoryId,
        name,
        entry.houseNumbers,
        entry.units,
        order,
        entry.lat,
        entry.lng,
      );
    }
  });
  run();
  return added;
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

  const insert = db.prepare(
    `INSERT INTO streets (territory_id, name, house_numbers, units, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let order = existing.m;
  const run = db.transaction(() => {
    for (const line of lines) {
      const parsed = parseStreetLine(line);
      order += 1;
      insert.run(territoryId, parsed.name, parsed.houseNumbers, parsed.units, order);
    }
  });
  run();
  return lines.length;
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
  outcome: VisitOutcome;
  reasonId: number | null;
  reasonNote: string;
  energyType: "" | "STROM" | "GAS" | "BEIDES";
  followUpAt: string | null;
  lat: number | null;
  lng: number | null;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO visits
         (team_id, user_id, territory_id, street_id, house_number, outcome,
          reason_id, reason_note, energy_type, follow_up_at, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.teamId,
      input.userId,
      input.territoryId,
      input.streetId,
      input.houseNumber,
      input.outcome,
      input.reasonId,
      input.reasonNote,
      input.energyType,
      input.followUpAt,
      input.lat,
      input.lng,
    );

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

export function reasonStats(teamId: number, since?: string): ReasonStat[] {
  const joinFilter = since ? "AND v.created_at >= ?" : "";
  const params: (string | number)[] = since ? [since, teamId] : [teamId];
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
        WHERE team_id = ? ${extra} AND date(created_at) >= date('now', ?)
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
} | null {
  const row = getDb()
    .prepare(
      `SELECT finished_at, status, source, row_count, message
         FROM energy_refresh_log ORDER BY id DESC LIMIT 1`,
    )
    .get() as
    | { finished_at: string | null; status: string; source: string; row_count: number; message: string }
    | undefined;
  return row ?? null;
}
