import { getDb, setSetting } from "../db";
import { loadFeed, type PriceRow } from "./adapters";

export interface RefreshResult {
  status: "ok" | "error";
  source: string;
  rowCount: number;
  isDemo: boolean;
  message: string;
  finishedAt: string;
}

/**
 * Holt die Tagespreise und schreibt sie in die Datenbank.
 * Wird taeglich per Cron ueber /api/energy/refresh aufgerufen.
 */
export async function refreshEnergyPrices(): Promise<RefreshResult> {
  const db = getDb();
  const startedAt = new Date().toISOString();
  const logId = db
    .prepare(
      "INSERT INTO energy_refresh_log (started_at, status) VALUES (?, 'running')",
    )
    .run(startedAt).lastInsertRowid as number;

  try {
    const feed = await loadFeed();
    writeRows(feed.rows, feed.source);

    const finishedAt = new Date().toISOString();
    db.prepare(
      `UPDATE energy_refresh_log
          SET finished_at = ?, status = 'ok', source = ?, row_count = ?, message = ''
        WHERE id = ?`,
    ).run(finishedAt, feed.source, feed.rows.length, logId);

    setSetting("energy_last_success", finishedAt);
    setSetting("energy_source", feed.source);
    setSetting("energy_is_demo", feed.isDemo ? "1" : "0");

    return {
      status: "ok",
      source: feed.source,
      rowCount: feed.rows.length,
      isDemo: feed.isDemo,
      message: `${feed.rows.length} Postleitzahlen aktualisiert`,
      finishedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date().toISOString();
    db.prepare(
      `UPDATE energy_refresh_log
          SET finished_at = ?, status = 'error', message = ?
        WHERE id = ?`,
    ).run(finishedAt, message, logId);
    return {
      status: "error",
      source: "",
      rowCount: 0,
      isDemo: false,
      message,
      finishedAt,
    };
  }
}

function writeRows(rows: PriceRow[], source: string) {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO energy_prices
      (postal_code, city, state, provider, lat, lng, strom_ct_kwh, strom_base_eur,
       gas_ct_kwh, gas_base_eur, households, source, is_demo, valid_from, updated_at)
    VALUES
      (@postal_code, @city, @state, @provider, @lat, @lng, @strom_ct_kwh, @strom_base_eur,
       @gas_ct_kwh, @gas_base_eur, @households, @source, @is_demo, @valid_from, datetime('now'))
    ON CONFLICT(postal_code) DO UPDATE SET
      city           = excluded.city,
      state          = excluded.state,
      provider       = excluded.provider,
      lat            = excluded.lat,
      lng            = excluded.lng,
      strom_ct_kwh   = excluded.strom_ct_kwh,
      strom_base_eur = excluded.strom_base_eur,
      gas_ct_kwh     = excluded.gas_ct_kwh,
      gas_base_eur   = excluded.gas_base_eur,
      households     = excluded.households,
      source         = excluded.source,
      is_demo        = excluded.is_demo,
      valid_from     = excluded.valid_from,
      updated_at     = datetime('now')
  `);

  const run = db.transaction((items: PriceRow[]) => {
    for (const row of items) {
      upsert.run({
        ...row,
        source,
        is_demo: row.is_demo ? 1 : 0,
      });
    }
  });
  run(rows);
}

/**
 * Jahreskosten eines Musterhaushalts beim Grundversorger.
 * Standardverbrauch: Strom 3.500 kWh, Gas 15.000 kWh (typischer 3-Personen-Haushalt).
 */
export function annualCost(
  workingPriceCtKwh: number | null,
  basePriceEurYear: number | null,
  consumptionKwh: number,
): number | null {
  if (workingPriceCtKwh === null) return null;
  return Math.round((workingPriceCtKwh / 100) * consumptionKwh + (basePriceEurYear ?? 0));
}

export const CONSUMPTION_STROM_KWH = 3500;
export const CONSUMPTION_GAS_KWH = 15000;
