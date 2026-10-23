import { getDb } from "./db";
import { optionalText, ValidationError } from "./api";
import { APPOINTMENT_HOUSE } from "./queries";
import { contractEnd, normalizeDay, recallUntil } from "./contracts";
import type { User } from "./types";

/**
 * Kundenliste - wer hinter jedem Abschluss steht.
 *
 * An der Tuer nimmt die App bewusst keine Kundendaten auf (die gehoeren in
 * den Tarifrechner des Partners). Die Teamleitung traegt sie nachtraeglich
 * aus dem Buchungsportal ein: Name, Rufnummer und Vertragslaufzeit. Kurz vor
 * Vertragsende steht der Kunde dann unter "Fällig" - zum Anrufen, Besuchen
 * und Umberaten.
 */

export type CustomerView = "faellig" | "offen" | "alle";

export interface CustomerRow {
  visit_id: number;
  /** Zeitpunkt des Abschlusses (SQLite, UTC). */
  sold_at: string;
  energy_type: string;
  house_number: string;
  street_id: number | null;
  street_name: string | null;
  doorbell_label: string | null;
  territory_name: string | null;
  postal_code: string;
  city: string;
  lat: number | null;
  lng: number | null;
  user_id: number;
  user_name: string;
  name: string;
  phone: string;
  customer_number: string;
  contract_start: string | null;
  contract_months: number | null;
  contract_end: string | null;
  note: string;
  recontacted_at: string | null;
}

export interface CustomerCounts {
  /** Alle Abschluesse des Teams. */
  total: number;
  /** Abschluesse ohne Name und Rufnummer - noch zuzuordnen. */
  open: number;
  /** Vertrag endet bald oder ist schon vorbei, noch niemand hat umberaten. */
  due: number;
}

/** Noch kein Kunde zugeordnet: weder Name noch Rufnummer. */
const WITHOUT_CUSTOMER = "(c.visit_id IS NULL OR (c.name = '' AND c.phone = ''))";
const DUE = "c.recontacted_at IS NULL AND c.contract_end IS NOT NULL AND c.contract_end <= ?";

const SELECT = `
  SELECT v.id AS visit_id, v.created_at AS sold_at, v.energy_type, v.house_number,
         s.id AS street_id, s.name AS street_name, d.label AS doorbell_label,
         t.name AS territory_name, COALESCE(t.postal_code, '') AS postal_code, COALESCE(t.city, '') AS city,
         -- Fuer die Route: zuerst die Lage des Hauses selbst, dann wo erfasst wurde, dann die Strasse.
         COALESCE((SELECT h.lat FROM house_numbers h WHERE ${APPOINTMENT_HOUSE}), v.lat, s.lat) AS lat,
         COALESCE((SELECT h.lng FROM house_numbers h WHERE ${APPOINTMENT_HOUSE}), v.lng, s.lng) AS lng,
         v.user_id, u.name AS user_name,
         COALESCE(c.name, '') AS name, COALESCE(c.phone, '') AS phone,
         COALESCE(c.customer_number, '') AS customer_number,
         c.contract_start, c.contract_months, c.contract_end,
         COALESCE(c.note, '') AS note, c.recontacted_at
    FROM visits v
    JOIN users u ON u.id = v.user_id
    LEFT JOIN sale_customers c ON c.visit_id = v.id
    LEFT JOIN streets s ON s.id = v.street_id
    LEFT JOIN territories t ON t.id = v.territory_id
    LEFT JOIN doorbells d ON d.id = v.doorbell_id`;

/** Wie viele Abschluesse es je Ansicht gibt - die Listen selbst sind begrenzt. */
export function countCustomers(teamId: number, today: string): CustomerCounts {
  return getDb()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM visits v WHERE v.team_id = ? AND v.outcome = 'SALE') AS total,
         (SELECT COUNT(*) FROM visits v LEFT JOIN sale_customers c ON c.visit_id = v.id
           WHERE v.team_id = ? AND v.outcome = 'SALE' AND ${WITHOUT_CUSTOMER}) AS open,
         (SELECT COUNT(*) FROM sale_customers c WHERE c.team_id = ? AND ${DUE}) AS due`,
    )
    .get(teamId, teamId, teamId, recallUntil(today)) as CustomerCounts;
}

/**
 * Abschluesse einer Ansicht:
 * - faellig: Vertragsende bis RECALL_LEAD_DAYS voraus, das frueheste zuerst
 * - offen:   noch ohne Kunde, der neueste Abschluss zuerst
 * - alle:    alles, der neueste zuerst; `query` sucht in Kunde, Adresse und Verkaeufer
 */
export function listCustomers(
  teamId: number,
  opts: { view: CustomerView; today: string; query?: string; limit?: number },
): CustomerRow[] {
  const where = ["v.team_id = ?", "v.outcome = 'SALE'"];
  const params: (string | number)[] = [teamId];
  let order = "v.created_at DESC, v.id DESC";
  if (opts.view === "faellig") {
    where.push(DUE);
    params.push(recallUntil(opts.today));
    order = "c.contract_end ASC, v.id";
  } else if (opts.view === "offen") {
    where.push(WITHOUT_CUSTOMER);
  }
  const query = opts.query?.trim();
  if (query) {
    const fields = ["c.name", "c.phone", "c.customer_number", "s.name", "v.house_number", "t.city", "t.postal_code", "u.name"];
    where.push(`(${fields.map((field) => `${field} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    params.push(...fields.map(() => pattern));
  }
  params.push(opts.limit ?? 300);
  return getDb()
    .prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?`)
    .all(...params) as CustomerRow[];
}

/** Ein Abschluss samt Kunde - null, wenn es ihn im Team nicht gibt. */
export function getCustomer(teamId: number, visitId: number): CustomerRow | null {
  const row = getDb()
    .prepare(`${SELECT} WHERE v.id = ? AND v.team_id = ? AND v.outcome = 'SALE'`)
    .get(visitId, teamId) as CustomerRow | undefined;
  return row ?? null;
}

/** Fuer den Export: jeder Abschluss des Teams, der neueste zuerst. */
export function exportCustomers(teamId: number): CustomerRow[] {
  return getDb()
    .prepare(`${SELECT} WHERE v.team_id = ? AND v.outcome = 'SALE' ORDER BY v.created_at DESC, v.id DESC`)
    .all(teamId) as CustomerRow[];
}

/**
 * Kunde eines Abschlusses eintragen oder aendern. Nur mitgeschickte Felder
 * aendern sich - so hakt der Knopf in der Liste ab, ohne den Rest anzufassen.
 *
 * Aus Lieferbeginn und Laufzeit ergibt sich das Vertragsende, wenn keins
 * angegeben ist. Ein neues Vertragsende (etwa nach dem Umberaten) beginnt
 * die Wiedervorlage von vorn.
 */
export function saveCustomer(user: User, visitId: number, body: Record<string, unknown>): CustomerRow {
  const db = getDb();
  return db.transaction(() => {
    const visit = db
      .prepare("SELECT id, outcome FROM visits WHERE id = ? AND team_id = ?")
      .get(visitId, user.team_id) as { id: number; outcome: string } | undefined;
    if (!visit) throw new Error("Auftrag nicht gefunden.");
    if (visit.outcome !== "SALE") throw new ValidationError("Kunden lassen sich nur einem Abschluss zuordnen.");

    const current = db.prepare("SELECT * FROM sale_customers WHERE visit_id = ?").get(visitId) as
      | {
          name: string;
          phone: string;
          customer_number: string;
          contract_start: string | null;
          contract_months: number | null;
          contract_end: string | null;
          note: string;
          recontacted_at: string | null;
          recontacted_by: number | null;
        }
      | undefined;
    const next = {
      name: current?.name ?? "",
      phone: current?.phone ?? "",
      customer_number: current?.customer_number ?? "",
      contract_start: current?.contract_start ?? null,
      contract_months: current?.contract_months ?? null,
      contract_end: current?.contract_end ?? null,
      note: current?.note ?? "",
      recontacted_at: current?.recontacted_at ?? null,
      recontacted_by: current?.recontacted_by ?? null,
    };

    if (body.name !== undefined) next.name = optionalText(body.name, 120);
    if (body.phone !== undefined) next.phone = parsePhone(body.phone);
    if (body.customerNumber !== undefined) next.customer_number = optionalText(body.customerNumber, 60);
    if (body.note !== undefined) next.note = optionalText(body.note, 1000);
    if (body.contractStart !== undefined) next.contract_start = parseDay(body.contractStart, "Der Lieferbeginn");
    if (body.contractMonths !== undefined) next.contract_months = parseMonths(body.contractMonths);
    if (body.contractEnd !== undefined) next.contract_end = parseDay(body.contractEnd, "Das Vertragsende");
    // Vertragsende nicht angegeben: aus Lieferbeginn und Laufzeit.
    const datesChanged = ["contractStart", "contractMonths", "contractEnd"].some((key) => body[key] !== undefined);
    if (datesChanged && !next.contract_end && next.contract_start && next.contract_months) {
      next.contract_end = contractEnd(next.contract_start, next.contract_months) || null;
    }
    if (next.contract_start && next.contract_end && next.contract_end < next.contract_start) {
      throw new ValidationError("Das Vertragsende liegt vor dem Lieferbeginn.");
    }

    if (body.recontacted !== undefined) {
      if (!body.recontacted) {
        next.recontacted_at = null;
        next.recontacted_by = null;
      } else if (!next.recontacted_at) {
        next.recontacted_at = new Date().toISOString().slice(0, 19).replace("T", " ");
        next.recontacted_by = user.id;
      }
    } else if (next.contract_end !== (current?.contract_end ?? null)) {
      next.recontacted_at = null;
      next.recontacted_by = null;
    }

    db.prepare(
      `INSERT INTO sale_customers (visit_id, team_id, name, phone, customer_number, contract_start,
         contract_months, contract_end, note, recontacted_at, recontacted_by, updated_by, updated_at)
       VALUES (@visit_id, @team_id, @name, @phone, @customer_number, @contract_start,
         @contract_months, @contract_end, @note, @recontacted_at, @recontacted_by, @updated_by, datetime('now'))
       ON CONFLICT(visit_id) DO UPDATE SET
         name = excluded.name, phone = excluded.phone, customer_number = excluded.customer_number,
         contract_start = excluded.contract_start, contract_months = excluded.contract_months,
         contract_end = excluded.contract_end, note = excluded.note,
         recontacted_at = excluded.recontacted_at, recontacted_by = excluded.recontacted_by,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    ).run({ ...next, visit_id: visitId, team_id: user.team_id, updated_by: user.id });
    return getCustomer(user.team_id, visitId)!;
  }).immediate();
}

/** Kundendaten eines Abschlusses loeschen - der Abschluss selbst bleibt. */
export function clearCustomer(user: User, visitId: number): void {
  const visit = getDb().prepare("SELECT id FROM visits WHERE id = ? AND team_id = ?").get(visitId, user.team_id);
  if (!visit) throw new Error("Auftrag nicht gefunden.");
  getDb().prepare("DELETE FROM sale_customers WHERE visit_id = ? AND team_id = ?").run(visitId, user.team_id);
}

/** Rufnummer, wie sie im Portal steht - aber mit Ziffern und ohne Buchstaben. */
function parsePhone(value: unknown): string {
  const phone = optionalText(value, 40);
  if (!phone) return "";
  if (!/^[+\d\s()/.-]+$/.test(phone) || phone.replace(/\D/g, "").length < 4) {
    throw new ValidationError("Bitte eine gültige Telefonnummer eingeben.");
  }
  return phone;
}

function parseDay(value: unknown, field: string): string | null {
  if (value === null || String(value).trim() === "") return null;
  const day = normalizeDay(value);
  if (!day) throw new ValidationError(`${field} ist kein gültiges Datum.`);
  return day;
}

function parseMonths(value: unknown): number | null {
  if (value === null || value === "") return null;
  const months = Number(value);
  if (!Number.isInteger(months) || months < 1 || months > 120) {
    throw new ValidationError("Die Laufzeit muss zwischen 1 und 120 Monaten liegen.");
  }
  return months;
}
