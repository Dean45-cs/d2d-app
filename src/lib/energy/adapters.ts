import { CITIES, type CityRecord } from "./cities";
import { splitTable } from "./table";

/**
 * Optionale Tagesquelle fuer die Energiekarte.
 *
 * Die Karte zeigt, wo der oertliche GRUNDVERSORGER besonders teuer ist -
 * dort ist die Ersparnis beim Wechsel am groessten, also das beste Klingelgebiet.
 *
 * Es gibt keine offene, kostenlose API mit Grundversorger-Tarifen. Im
 * Normalfall traegt die Teamleitung die Preise deshalb selbst ein (direkt auf
 * der Energiekarte, einzeln oder als Tabelle). Wer doch eine Quelle hat - einen
 * Export des Tarifdatenanbieters oder eine als CSV veroeffentlichte Google-
 * Tabelle -, kann sie zusaetzlich taeglich abrufen lassen:
 *
 *   ENERGY_FEED_MODE=csv   -> taeglicher Abruf einer CSV unter ENERGY_FEED_URL
 *   ENERGY_FEED_MODE=json  -> taeglicher Abruf einer JSON-Liste/API
 *
 * Ohne beides bleibt die Tagesquelle aus. Erfundene Beispielpreise gibt es
 * nicht mehr - eine Karte, die Preise zeigt, muss echte zeigen.
 *
 * Erwartete Spalten/Felder (Gross-/Kleinschreibung egal, deutsche oder
 * englische Namen):
 *   plz | postal_code          (Pflicht)
 *   ort | city
 *   versorger | provider
 *   strom_ct_kwh | power_ct_kwh
 *   strom_grundpreis_eur       (pro Jahr)
 *   gas_ct_kwh
 *   gas_grundpreis_eur         (pro Jahr)
 *   lat, lng                   (optional, sonst aus der Staedteliste)
 *   gueltig_ab | valid_from    (optional)
 */

export interface PriceRow {
  postal_code: string;
  city: string;
  state: string;
  provider: string;
  lat: number;
  lng: number;
  strom_ct_kwh: number | null;
  strom_base_eur: number | null;
  gas_ct_kwh: number | null;
  gas_base_eur: number | null;
  households: number;
  valid_from: string | null;
}

export interface FeedResult {
  rows: PriceRow[];
  source: string;
}

const cityByPlz = new Map<string, CityRecord>(CITIES.map((c) => [c.plz, c]));

/* ------------------------------ Externe Feeds ---------------------------- */

function pick(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  // akzeptiert "38,12" ebenso wie "38.12"
  const normalised = value.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

function mapRow(raw: Record<string, unknown>): PriceRow | null {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) lower[k.trim().toLowerCase()] = v;

  const plz = pick(lower, "plz", "postal_code", "postleitzahl", "zip");
  if (!plz) return null;
  const padded = plz.padStart(5, "0");

  const known = cityByPlz.get(padded);
  const lat = toNumber(pick(lower, "lat", "latitude", "breite")) ?? known?.lat ?? null;
  const lng = toNumber(pick(lower, "lng", "lon", "longitude", "laenge")) ?? known?.lng ?? null;
  if (lat === null || lng === null) return null; // ohne Koordinate nicht kartierbar

  return {
    postal_code: padded,
    city: pick(lower, "ort", "city", "stadt") ?? known?.city ?? padded,
    state: pick(lower, "bundesland", "state") ?? known?.state ?? "",
    provider: pick(lower, "versorger", "grundversorger", "provider") ?? known?.provider ?? "",
    lat,
    lng,
    strom_ct_kwh: toNumber(pick(lower, "strom_ct_kwh", "power_ct_kwh", "strom", "arbeitspreis_strom")),
    strom_base_eur: toNumber(pick(lower, "strom_grundpreis_eur", "strom_base_eur", "grundpreis_strom")),
    gas_ct_kwh: toNumber(pick(lower, "gas_ct_kwh", "gas", "arbeitspreis_gas")),
    gas_base_eur: toNumber(pick(lower, "gas_grundpreis_eur", "gas_base_eur", "grundpreis_gas")),
    households: Math.round((known?.population ?? 0) / 2.0),
    valid_from: pick(lower, "gueltig_ab", "valid_from", "stand"),
  };
}

/** CSV mit Kopfzeile -> ein Objekt je Zeile. Trennzeichen ; , oder Tabulator. */
export function parseCsv(text: string): Record<string, string>[] {
  const [header, ...body] = splitTable(text);
  if (!header) return [];
  return body.map((cells) => {
    const obj: Record<string, string> = {};
    header.forEach((name, idx) => {
      obj[name] = cells[idx] ?? "";
    });
    return obj;
  });
}

async function fetchFeed(url: string): Promise<string> {
  const headers: Record<string, string> = { "user-agent": "d2d-app/1.0" };
  if (process.env.ENERGY_FEED_TOKEN) {
    headers.authorization = `Bearer ${process.env.ENERGY_FEED_TOKEN}`;
  }
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Quelle antwortete mit HTTP ${response.status}`);
  }
  return response.text();
}

export interface FeedConfig {
  mode: "csv" | "json";
  url: string;
  label: string;
}

/** Die eingerichtete Tagesquelle - null, wenn keine eingerichtet ist. */
export function feedConfig(): FeedConfig | null {
  const mode = (process.env.ENERGY_FEED_MODE ?? "").trim().toLowerCase();
  const url = process.env.ENERGY_FEED_URL?.trim();
  if ((mode !== "csv" && mode !== "json") || !url) return null;
  return { mode, url, label: process.env.ENERGY_FEED_LABEL?.trim() ?? "" };
}

/** Holt die aktuellen Preise aus der eingerichteten Quelle. */
export async function loadFeed(): Promise<FeedResult> {
  const config = feedConfig();
  if (!config) {
    throw new Error("Keine Tagesquelle eingerichtet (ENERGY_FEED_MODE und ENERGY_FEED_URL).");
  }

  const text = await fetchFeed(config.url);
  const raw: Record<string, unknown>[] =
    config.mode === "json"
      ? (() => {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) return parsed;
          if (Array.isArray(parsed?.data)) return parsed.data;
          if (Array.isArray(parsed?.rows)) return parsed.rows;
          throw new Error("JSON-Quelle enthaelt keine Liste (data/rows erwartet)");
        })()
      : parseCsv(text);

  const rows = raw
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((r): r is PriceRow => r !== null);

  if (rows.length === 0) {
    throw new Error("Quelle lieferte keine verwertbaren Zeilen (PLZ + Koordinate noetig)");
  }

  return {
    rows,
    source: config.label || new URL(config.url).host,
  };
}
