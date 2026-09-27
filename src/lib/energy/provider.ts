/**
 * Welcher Grundversorger ist fuer ein Gebiet zustaendig, und wie teuer ist er?
 *
 * Zwei Quellen: selbst gepflegte Preise des Teams (vom Preisblatt des
 * Versorgers abgetippt) und die Tagesquelle (Feed oder Demo-Werte). Ein
 * Gebiet wird in dieser Reihenfolge zugeordnet:
 *   1. gepflegter Preis mit gleicher PLZ oder gleichem Ort
 *   2. Tagesquelle mit gleicher PLZ oder gleichem Ort
 *   3. naechster gepflegter Ort zur Gebietsmitte (hoechstens 30 km)
 *   4. naechster Ort der Tagesquelle (hoechstens 30 km)
 *   5. gleiche PLZ-Region (die ersten drei Ziffern)
 * Bei 3. bis 5. zeigt die Oberflaeche den Ort, von dem der Preis stammt -
 * ein Nachbarort kann einen anderen Grundversorger haben.
 *
 * Bewertet wird die Tagesquelle untereinander (Rangfolge aller Orte), ein
 * gepflegter Preis dagegen am Bundesdurchschnitt der Grundversorgung.
 */
import { listEnergyPrices } from "../queries";
import type { EnergyPrice } from "../types";
import { centerOf, type LatLng } from "../geo/area";
import { annualCost, CONSUMPTION_GAS_KWH, CONSUMPTION_STROM_KWH } from "./refresh";
import {
  getReference,
  listManualPrices,
  referenceYear,
  STALE_AFTER_DAYS,
  type ManualPrice,
} from "./manual";
import {
  priceScale,
  priceStep,
  referenceStep,
  type PriceScale,
  type PriceStep,
} from "./rating";

const NEARBY_KM = 30;

export interface PriceInfo {
  /** Arbeitspreis in ct/kWh */
  ct: number;
  /** Jahreskosten des Musterhaushalts in Euro */
  year: number;
  step: PriceStep;
  /** Abstand zum Vergleichswert, Euro pro Jahr (+ = teurer) */
  delta: number;
  /** Womit verglichen wurde: Median aller Orte oder Bundesdurchschnitt */
  basis: "median" | "average";
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
  isDemo: boolean;
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

  const scale = { strom: scaleOf(rows, "strom"), gas: scaleOf(rows, "gas") };

  function fromFeed(row: EnergyPrice, match: ProviderInfo["match"], km: number | null): ProviderInfo {
    const strom = annualCost(row.strom_ct_kwh, row.strom_base_eur, CONSUMPTION_STROM_KWH);
    const gas = annualCost(row.gas_ct_kwh, row.gas_base_eur, CONSUMPTION_GAS_KWH);
    return {
      provider: row.provider,
      gasProvider: "",
      city: row.city,
      plz: row.postal_code,
      match,
      distanceKm: km,
      isDemo: row.is_demo === 1,
      manual: false,
      validFrom: row.valid_from ?? "",
      sourceUrl: "",
      stale: false,
      strom:
        row.strom_ct_kwh !== null && strom !== null
          ? {
              ct: row.strom_ct_kwh,
              year: strom,
              step: priceStep(strom, scale.strom),
              delta: Math.round(strom - scale.strom.median),
              basis: "median",
            }
          : null,
      gas:
        row.gas_ct_kwh !== null && gas !== null
          ? {
              ct: row.gas_ct_kwh,
              year: gas,
              step: priceStep(gas, scale.gas),
              delta: Math.round(gas - scale.gas.median),
              basis: "median",
            }
          : null,
    };
  }

  function fromManual(row: ManualPrice, match: ProviderInfo["match"], km: number | null): ProviderInfo {
    const strom = annualCost(row.strom_ct_kwh, row.strom_base_eur, CONSUMPTION_STROM_KWH);
    const gas = annualCost(row.gas_ct_kwh, row.gas_base_eur, CONSUMPTION_GAS_KWH);
    const updated = Date.parse(`${row.updated_at.replace(" ", "T")}Z`);
    return {
      provider: row.provider,
      gasProvider: row.gas_provider,
      city: row.city,
      plz: row.postal_code,
      match,
      distanceKm: km,
      isDemo: false,
      manual: true,
      validFrom: row.valid_from,
      sourceUrl: row.source_url,
      stale: Number.isFinite(updated) && Date.now() - updated > STALE_AFTER_DAYS * 86_400_000,
      strom:
        row.strom_ct_kwh !== null && strom !== null
          ? {
              ct: row.strom_ct_kwh,
              year: strom,
              step: referenceStep(strom, reference.strom),
              delta: Math.round(strom - reference.strom),
              basis: "average",
            }
          : null,
      gas:
        row.gas_ct_kwh !== null && gas !== null
          ? {
              ct: row.gas_ct_kwh,
              year: gas,
              step: referenceStep(gas, reference.gas),
              delta: Math.round(gas - reference.gas),
              basis: "average",
            }
          : null,
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

export function normalizeCity(city: string): string {
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
