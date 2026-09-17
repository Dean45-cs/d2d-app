import crypto from "node:crypto";
import { CITIES, type CityRecord } from "./cities";

/**
 * Datenquellen fuer die Energiekarte.
 *
 * Die Karte zeigt, wo der oertliche GRUNDVERSORGER besonders teuer ist -
 * dort ist die Ersparnis beim Wechsel am groessten, also das beste Klingelgebiet.
 *
 * Es gibt keine offene, kostenlose API mit tagesaktuellen Grundversorger-
 * Tarifen. Deshalb ist die Quelle austauschbar:
 *
 *   ENERGY_FEED_MODE=seed  -> Beispielwerte (deutlich als Demo markiert)
 *   ENERGY_FEED_MODE=csv   -> taeglicher Abruf einer CSV unter ENERGY_FEED_URL
 *   ENERGY_FEED_MODE=json  -> taeglicher Abruf einer JSON-Liste/API
 *
 * Erwartete Spalten/Felder (Gross-/Kleinschreibung egal, deutsche oder
 * englische Namen):
 *   plz | postal_code          (Pflicht)
 *   ort | city
 *   versorger | provider
 *   strom_ct_kwh | power_ct_kwh
 *   strom_grundpreis_eur
 *   gas_ct_kwh
 *   gas_grundpreis_eur
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
  is_demo: boolean;
}

export interface FeedResult {
  rows: PriceRow[];
  source: string;
  isDemo: boolean;
}

const cityByPlz = new Map<string, CityRecord>(CITIES.map((c) => [c.plz, c]));

/* ------------------------------ Seed-Adapter ----------------------------- */

/** Stabiler Pseudo-Zufall aus der PLZ - gleiche PLZ ergibt immer den gleichen Wert. */
function deterministic(seed: string, salt: string): number {
  const hash = crypto.createHash("sha256").update(`${seed}:${salt}`).digest();
  return hash.readUInt32BE(0) / 0xffffffff;
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Erzeugt Beispielpreise in realistischen Spannen, damit die Karte und alle
 * Auswertungen ohne externe Quelle bedienbar sind. Diese Werte sind KEINE
 * echten Tarife und werden in der Oberflaeche ueberall als "Demo" markiert.
 */
export function seedFeed(): FeedResult {
  const rows: PriceRow[] = CITIES.map((c) => {
    const s = deterministic(c.plz, "strom");
    const g = deterministic(c.plz, "gas");
    return {
      postal_code: c.plz,
      city: c.city,
      state: c.state,
      provider: c.provider,
      lat: c.lat,
      lng: c.lng,
      strom_ct_kwh: round(34 + s * 13, 2), // 34,00 - 47,00 ct/kWh
      strom_base_eur: round(95 + s * 90, 2),
      gas_ct_kwh: round(9.5 + g * 7, 2), // 9,50 - 16,50 ct/kWh
      gas_base_eur: round(100 + g * 130, 2),
      households: Math.round(c.population / 2.0),
      valid_from: null,
      is_demo: true,
    };
  });
  return { rows, source: "Demo-Beispieldaten (keine echten Tarife)", isDemo: true };
}

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
    is_demo: false,
  };
}

/** Sehr einfacher CSV-Parser: Trennzeichen ; oder , mit Anfuehrungszeichen. */
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const delimiter = (clean.split("\n")[0].match(/;/g)?.length ?? 0) >=
    (clean.split("\n")[0].match(/,/g)?.length ?? 0)
    ? ";"
    : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += char;
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field);
  rows.push(row);

  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((name, idx) => {
        obj[name.trim()] = (r[idx] ?? "").trim();
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

/** Holt die aktuellen Preise aus der konfigurierten Quelle. */
export async function loadFeed(): Promise<FeedResult> {
  const mode = (process.env.ENERGY_FEED_MODE ?? "seed").toLowerCase();
  const url = process.env.ENERGY_FEED_URL?.trim();
  const label = process.env.ENERGY_FEED_LABEL?.trim();

  if (mode === "seed" || !url) return seedFeed();

  const text = await fetchFeed(url);
  const raw: Record<string, unknown>[] =
    mode === "json"
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
    source: label || new URL(url).host,
    isDemo: false,
  };
}
