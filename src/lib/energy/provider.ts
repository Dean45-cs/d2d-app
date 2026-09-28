/**
 * Welcher Grundversorger ist fuer ein Gebiet zustaendig, und wie teuer ist er?
 *
 * Zwei Quellen: selbst gepflegte Preise des Teams (vom Preisblatt des
 * Versorgers abgetippt) und - falls eingerichtet - die Tagesquelle. Ein
 * Gebiet wird in dieser Reihenfolge zugeordnet:
 *   1. gepflegter Preis mit gleicher PLZ oder gleichem Ort
 *   2. Tagesquelle mit gleicher PLZ oder gleichem Ort
 *   3. naechster gepflegter Ort zur Gebietsmitte (hoechstens 30 km)
 *   4. naechster Ort der Tagesquelle (hoechstens 30 km)
 *   5. gleiche PLZ-Region (die ersten drei Ziffern)
 * Bei 3. bis 5. zeigt die Oberflaeche den Ort, von dem der Preis stammt -
 * ein Nachbarort kann einen anderen Grundversorger haben.
 *
 * Bewertet wird jeder Preis am Bundesdurchschnitt der Grundversorgung
 * (Vergleichswert in den Einstellungen) - genauso wie auf der Energiekarte.
 */
import { listEnergyPrices } from "../queries";
import type { EnergyPrice } from "../types";
import { centerOf, type LatLng } from "../geo/area";
import { annualCost, CONSUMPTION_GAS_KWH, CONSUMPTION_STROM_KWH } from "./refresh";
import {
  getReference,
  isStale,
  listManualPrices,
  referenceYear,
  type ManualPrice,
} from "./manual";
import { normalizeCity } from "./cities";
import { referenceStep, type PriceStep } from "./rating";

const NEARBY_KM = 30;

export interface PriceInfo {
  /** Arbeitspreis in ct/kWh */
  ct: number;
  /** Jahreskosten des Musterhaushalts in Euro */
  year: number;
  step: PriceStep;
  /** Abstand zum Bundesdurchschnitt, Euro pro Jahr (+ = teurer) */
  delta: number;
}

export interface ProviderInfo {
  provider: string;
  /** Gasversorger, wenn er ein anderer ist als beim Strom */
  gasProvider: string;
  /** Ort, aus dem der Preis stammt */
  city: string;
  plz: string;
  match: "plz" | "city" | "nearby" | "region";
  distanceKm: number | null;
  /** Vom Team selbst eingetragen */
  manual: boolean;
  /** "gueltig ab" laut Preisblatt (JJJJ-MM-TT) */
  validFrom: string;
  sourceUrl: string;
  /** Gepflegter Preis aelter als ein halbes Jahr - sollte geprueft werden */
  stale: boolean;
  strom: PriceInfo | null;
  gas: PriceInfo | null;
}

export interface Place {
  postal_code?: string;
  city?: string;
  area?: LatLng[] | null;
}

export interface ProviderLookup {
  find(place: Place): ProviderInfo | null;
  /** Wie viele Orte bekannt sind - 0 = noch nichts geladen. */
  size: number;
}

/**
 * Laedt die Preise einmal und ordnet danach beliebig viele Gebiete zu.
 * Mit teamId kommen die selbst gepflegten Preise des Teams dazu.
 */
export function providerLookup(teamId?: number): ProviderLookup {
  const rows = listEnergyPrices();
  const manual = teamId ? listManualPrices(teamId) : [];
  const reference = referenceYear(getReference(teamId ?? 0));

  function price(ct: number | null, base: number | null, energy: "strom" | "gas"): PriceInfo | null {
    if (ct === null) return null;
    const year = annualCost(ct, base, energy === "strom" ? CONSUMPTION_STROM_KWH : CONSUMPTION_GAS_KWH);
    if (year === null) return null;
    return {
      ct,
      year,
      step: referenceStep(year, reference[energy]),
      delta: Math.round(year - reference[energy]),
    };
  }

  function fromFeed(row: EnergyPrice, match: ProviderInfo["match"], km: number | null): ProviderInfo {
    return {
      provider: row.provider,
      gasProvider: "",
      city: row.city,
      plz: row.postal_code,
      match,
      distanceKm: km,
      manual: false,
      validFrom: row.valid_from ?? "",
      sourceUrl: "",
      stale: false,
      strom: price(row.strom_ct_kwh, row.strom_base_eur, "strom"),
      gas: price(row.gas_ct_kwh, row.gas_base_eur, "gas"),
    };
  }

  function fromManual(row: ManualPrice, match: ProviderInfo["match"], km: number | null): ProviderInfo {
    return {
      provider: row.provider,
      gasProvider: row.gas_provider,
      city: row.city,
      plz: row.postal_code,
      match,
      distanceKm: km,
      manual: true,
      validFrom: row.valid_from,
      sourceUrl: row.source_url,
      stale: isStale(row.updated_at),
      strom: price(row.strom_ct_kwh, row.strom_base_eur, "strom"),
      gas: price(row.gas_ct_kwh, row.gas_base_eur, "gas"),
    };
  }

  const feedIndex = index(rows);
  const manualIndex = index(manual);

  function find(place: Place): ProviderInfo | null {
    const plz = (place.postal_code ?? "").trim();
    const city = normalizeCity(place.city ?? "");

    const own = (plz && manualIndex.byPlz.get(plz)) || (city && manualIndex.byCity.get(city));
    if (own) return fromManual(own, own.postal_code === plz ? "plz" : "city", null);

    const feed = (plz && feedIndex.byPlz.get(plz)) || (city && feedIndex.byCity.get(city));
    if (feed) return fromFeed(feed, feed.postal_code === plz ? "plz" : "city", null);

    if (place.area && place.area.length >= 3) {
      const [lat, lng] = centerOf(place.area);
      const nearOwn = nearest(manual, lat, lng);
      if (nearOwn) return fromManual(nearOwn.row, "nearby", nearOwn.km);
      const nearFeed = nearest(rows, lat, lng);
      if (nearFeed) return fromFeed(nearFeed.row, "nearby", nearFeed.km);
    }

    if (/^\d{5}$/.test(plz)) {
      const prefix = plz.slice(0, 3);
      const ownRegion = manual.find((row) => row.postal_code.slice(0, 3) === prefix);
      if (ownRegion) return fromManual(ownRegion, "region", null);
      const region = rows.find((row) => row.postal_code.slice(0, 3) === prefix);
      if (region) return fromFeed(region, "region", null);
    }
    return null;
  }

  return { find, size: rows.length + manual.length };
}

function index<T extends { postal_code: string; city: string }>(rows: T[]) {
  const byPlz = new Map<string, T>();
  const byCity = new Map<string, T>();
  for (const row of rows) {
    if (row.postal_code && !byPlz.has(row.postal_code)) byPlz.set(row.postal_code, row);
    const key = normalizeCity(row.city);
    if (key && !byCity.has(key)) byCity.set(key, row);
  }
  return { byPlz, byCity };
}

function nearest<T extends { lat: number | null; lng: number | null }>(
  rows: T[],
  lat: number,
  lng: number,
): { row: T; km: number } | null {
  let best: T | null = null;
  let bestKm = Infinity;
  for (const row of rows) {
    if (row.lat === null || row.lng === null) continue;
    const km = distanceKm(lat, lng, row.lat, row.lng);
    if (km < bestKm) {
      best = row;
      bestKm = km;
    }
  }
  return best && bestKm <= NEARBY_KM ? { row: best, km: Math.round(bestKm) } : null;
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
