/**
 * Selbst gepflegte Grundversorger-Preise.
 *
 * Eine kostenlose Schnittstelle mit echten Grundversorgungstarifen gibt es
 * nicht. Jeder Grundversorger muss seine Preise aber gut auffindbar im
 * Internet veroeffentlichen (§ 36 EnWG) - die Teamleitung tippt sie fuer die
 * eigenen Orte vom Preisblatt ab. Diese Werte gehen allen Werten aus der
 * Tagesquelle vor.
 */
import { getDb, getSetting, setSetting } from "../db";
import { CONSUMPTION_GAS_KWH, CONSUMPTION_STROM_KWH } from "./refresh";

export interface ManualPrice {
  id: number;
  team_id: number;
  postal_code: string;
  city: string;
  provider: string;
  /** Leer = derselbe Versorger wie beim Strom */
  gas_provider: string;
  lat: number | null;
  lng: number | null;
  strom_ct_kwh: number | null;
  /** Grundpreis pro Jahr */
  strom_base_eur: number | null;
  gas_ct_kwh: number | null;
  gas_base_eur: number | null;
  valid_from: string;
  source_url: string;
  updated_at: string;
  updated_by: number | null;
}

export type ManualPriceInput = Omit<ManualPrice, "id" | "team_id" | "updated_at" | "updated_by">;

export function listManualPrices(teamId: number): ManualPrice[] {
  return getDb()
    .prepare("SELECT * FROM provider_prices WHERE team_id = ? ORDER BY city, postal_code")
    .all(teamId) as ManualPrice[];
}

/** Legt einen Ort an oder ersetzt ihn (eine Zeile je PLZ). */
export function saveManualPrice(teamId: number, userId: number, input: ManualPriceInput): number {
  const db = getDb();
  db.prepare(
    `INSERT INTO provider_prices
       (team_id, postal_code, city, provider, gas_provider, lat, lng,
        strom_ct_kwh, strom_base_eur, gas_ct_kwh, gas_base_eur,
        valid_from, source_url, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT (team_id, postal_code) DO UPDATE SET
       city = excluded.city, provider = excluded.provider,
       gas_provider = excluded.gas_provider,
       lat = COALESCE(excluded.lat, provider_prices.lat),
       lng = COALESCE(excluded.lng, provider_prices.lng),
       strom_ct_kwh = excluded.strom_ct_kwh, strom_base_eur = excluded.strom_base_eur,
       gas_ct_kwh = excluded.gas_ct_kwh, gas_base_eur = excluded.gas_base_eur,
       valid_from = excluded.valid_from, source_url = excluded.source_url,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(
    teamId,
    input.postal_code,
    input.city,
    input.provider,
    input.gas_provider,
    input.lat,
    input.lng,
    input.strom_ct_kwh,
    input.strom_base_eur,
    input.gas_ct_kwh,
    input.gas_base_eur,
    input.valid_from,
    input.source_url,
    userId,
  );
  const row = db
    .prepare("SELECT id FROM provider_prices WHERE team_id = ? AND postal_code = ?")
    .get(teamId, input.postal_code) as { id: number };
  return row.id;
}

export function deleteManualPrice(teamId: number, id: number): boolean {
  return (
    getDb().prepare("DELETE FROM provider_prices WHERE id = ? AND team_id = ?").run(id, teamId)
      .changes > 0
  );
}

/* ------------------------------ Vergleichswert ----------------------------- */

/**
 * Bundesdurchschnitt der Grundversorgung als Massstab fuer gepflegte Preise.
 * Voreinstellung: Stand September 2026 laut Check24/Verivox - Strom rund
 * 37,3 ct/kWh plus 13,76 EUR Grundpreis im Monat, Gas rund 13,6 ct/kWh.
 * Die Teamleitung kann die Werte in den Einstellungen anpassen.
 */
export const DEFAULT_REFERENCE = {
  stromCt: 37.3,
  stromBaseMonth: 13.76,
  gasCt: 13.6,
  gasBaseMonth: 0,
};

export type Reference = typeof DEFAULT_REFERENCE;

function num(value: string, fallback: number): number {
  const n = Number(value);
  return value !== "" && Number.isFinite(n) ? n : fallback;
}

export function getReference(teamId: number): Reference {
  const raw = getSetting(`price_reference:${teamId}`, "");
  if (!raw) return DEFAULT_REFERENCE;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof Reference, unknown>>;
    return {
      stromCt: num(String(parsed.stromCt ?? ""), DEFAULT_REFERENCE.stromCt),
      stromBaseMonth: num(String(parsed.stromBaseMonth ?? ""), DEFAULT_REFERENCE.stromBaseMonth),
      gasCt: num(String(parsed.gasCt ?? ""), DEFAULT_REFERENCE.gasCt),
      gasBaseMonth: num(String(parsed.gasBaseMonth ?? ""), DEFAULT_REFERENCE.gasBaseMonth),
    };
  } catch {
    return DEFAULT_REFERENCE;
  }
}

export function setReference(teamId: number, reference: Reference): void {
  setSetting(`price_reference:${teamId}`, JSON.stringify(reference));
}

/** Jahreskosten des Musterhaushalts beim Bundesdurchschnitt. */
export function referenceYear(reference: Reference): { strom: number; gas: number } {
  return {
    strom: Math.round((reference.stromCt / 100) * CONSUMPTION_STROM_KWH + reference.stromBaseMonth * 12),
    gas: Math.round((reference.gasCt / 100) * CONSUMPTION_GAS_KWH + reference.gasBaseMonth * 12),
  };
}

/** Nach so vielen Tagen sollte ein gepflegter Preis geprueft werden. */
export const STALE_AFTER_DAYS = 183;
