/**
 * Welcher Grundversorger ist fuer ein Gebiet zustaendig, und wie teuer ist er?
 *
 * Die Preisquelle kennt Orte ueber ihre Postleitzahl. Ein Gebiet wird in
 * dieser Reihenfolge zugeordnet:
 *   1. gleiche Postleitzahl
 *   2. gleicher Ortsname
 *   3. naechster Ort der Preisquelle zur Gebietsmitte (hoechstens 30 km)
 *   4. gleiche PLZ-Region (die ersten drei Ziffern)
 * Bei 3. und 4. zeigt die Oberflaeche den Ort, von dem der Preis stammt -
 * ein Nachbarort kann einen anderen Grundversorger haben.
 */
import { listEnergyPrices } from "../queries";
import type { EnergyPrice } from "../types";
import { centerOf, type LatLng } from "../geo/area";
import { annualCost, CONSUMPTION_GAS_KWH, CONSUMPTION_STROM_KWH } from "./refresh";
import { priceScale, priceStep, type PriceScale, type PriceStep } from "./rating";

const NEARBY_KM = 30;

export interface PriceInfo {
  /** Arbeitspreis in ct/kWh */
  ct: number;
  /** Jahreskosten des Musterhaushalts in Euro */
  year: number;
  step: PriceStep;
  /** Abstand zum Median aller Orte, Euro pro Jahr (+ = teurer) */
  delta: number;
}

export interface ProviderInfo {
  provider: string;
  /** Ort, aus dem der Preis stammt */
  city: string;
  plz: string;
  match: "plz" | "city" | "nearby" | "region";
  distanceKm: number | null;
  isDemo: boolean;
  strom: PriceInfo | null;
  gas: PriceInfo | null;
}

export interface ProviderLookup {
  find(place: { postal_code?: string; city?: string; area?: LatLng[] | null }): ProviderInfo | null;
  /** Wie viele Orte die Preisquelle kennt - 0 = noch nichts geladen. */
  size: number;
}

/** Laedt die Preise einmal und ordnet danach beliebig viele Gebiete zu. */
export function providerLookup(rows: EnergyPrice[] = listEnergyPrices()): ProviderLookup {
  const strom = scaleOf(rows, "strom");
  const gas = scaleOf(rows, "gas");
  const byPlz = new Map(rows.map((row) => [row.postal_code, row]));
  const byCity = new Map<string, EnergyPrice>();
  for (const row of rows) {
    const key = normalizeCity(row.city);
    if (key && !byCity.has(key)) byCity.set(key, row);
  }

  function info(row: EnergyPrice, match: ProviderInfo["match"], distanceKm: number | null) {
    return {
      provider: row.provider,
      city: row.city,
      plz: row.postal_code,
      match,
      distanceKm,
      isDemo: row.is_demo === 1,
      strom: priceInfo(row.strom_ct_kwh, row.strom_base_eur, CONSUMPTION_STROM_KWH, strom),
      gas: priceInfo(row.gas_ct_kwh, row.gas_base_eur, CONSUMPTION_GAS_KWH, gas),
    } satisfies ProviderInfo;
  }

  function find(place: { postal_code?: string; city?: string; area?: LatLng[] | null }) {
    if (rows.length === 0) return null;

    const plz = (place.postal_code ?? "").trim();
    const exact = plz ? byPlz.get(plz) : undefined;
    if (exact) return info(exact, "plz", null);

    const sameCity = byCity.get(normalizeCity(place.city ?? ""));
    if (sameCity) return info(sameCity, "city", null);

    if (place.area && place.area.length >= 3) {
      const [lat, lng] = centerOf(place.area);
      let best: EnergyPrice | null = null;
      let bestKm = Infinity;
      for (const row of rows) {
        const km = distanceKm(lat, lng, row.lat, row.lng);
        if (km < bestKm) {
          best = row;
          bestKm = km;
        }
      }
      if (best && bestKm <= NEARBY_KM) return info(best, "nearby", Math.round(bestKm));
    }

    if (/^\d{5}$/.test(plz)) {
      const region = rows.find((row) => row.postal_code.slice(0, 3) === plz.slice(0, 3));
      if (region) return info(region, "region", null);
    }
    return null;
  }

  return { find, size: rows.length };
}

function scaleOf(rows: EnergyPrice[], energy: "strom" | "gas"): PriceScale {
  const values = rows
    .map((row) =>
      energy === "strom"
        ? annualCost(row.strom_ct_kwh, row.strom_base_eur, CONSUMPTION_STROM_KWH)
        : annualCost(row.gas_ct_kwh, row.gas_base_eur, CONSUMPTION_GAS_KWH),
    )
    .filter((value): value is number => value !== null);
  return priceScale(values);
}

function priceInfo(
  ct: number | null,
  base: number | null,
  kwh: number,
  scale: PriceScale,
): PriceInfo | null {
  const year = annualCost(ct, base, kwh);
  if (ct === null || year === null) return null;
  return { ct, year, step: priceStep(year, scale), delta: Math.round(year - scale.median) };
}

function normalizeCity(city: string): string {
  return city
    .toLocaleLowerCase("de-DE")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Luftlinie in km (Haversine). */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
