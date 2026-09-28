/**
 * Daten der Energiekarte - ohne "use client", damit die Server-Seite damit
 * ein Formular vorbelegen kann (Link "Preis eintragen" aus einem Gebiet).
 */

/** Ort mit Preis: selbst eingetragen oder aus der Tagesquelle. */
export interface MapPoint {
  key: string;
  /** Eintrag des Teams (bearbeitbar); null = Tagesquelle */
  id: number | null;
  plz: string;
  city: string;
  provider: string;
  gasProvider: string;
  /** Ohne Lage steht der Ort nur in der Liste, nicht auf der Karte. */
  lat: number | null;
  lng: number | null;
  stromCt: number | null;
  stromBaseMonth: number | null;
  gasCt: number | null;
  gasBaseMonth: number | null;
  /** Jahreskosten des Musterhaushalts */
  stromYear: number | null;
  gasYear: number | null;
  validFrom: string;
  sourceUrl: string;
  stale: boolean;
}

/** Ort eines eigenen Gebiets, fuer den noch kein Preis vorliegt. */
export interface OpenPoint {
  key: string;
  plz: string;
  city: string;
  territories: string[];
  lat: number | null;
  lng: number | null;
  /** Namensvorschlag fuer den Grundversorger */
  provider: string;
}

/** Formular "Preis eintragen" - Werte als Text, so wie sie getippt werden. */
export interface PriceDraft {
  /** Beim Bearbeiten der vorhandene Eintrag */
  id: number | null;
  postalCode: string;
  city: string;
  provider: string;
  gasProvider: string;
  stromCt: string;
  stromBaseMonth: string;
  gasCt: string;
  gasBaseMonth: string;
  validFrom: string;
  sourceUrl: string;
  lat: number | null;
  lng: number | null;
}

export const EMPTY_DRAFT: PriceDraft = {
  id: null,
  postalCode: "",
  city: "",
  provider: "",
  gasProvider: "",
  stromCt: "",
  stromBaseMonth: "",
  gasCt: "",
  gasBaseMonth: "",
  validFrom: "",
  sourceUrl: "",
  lat: null,
  lng: null,
};

/** 38.5 -> "38,5"; null -> "". */
export function numberText(value: number | null, digits = 3): string {
  return value === null
    ? ""
    : value.toLocaleString("de-DE", { maximumFractionDigits: digits, useGrouping: false });
}

/** Formular zu einem Ort mit Preis: bearbeiten (eigener) oder uebernehmen (Tagesquelle). */
export function draftFromPoint(point: MapPoint): PriceDraft {
  return {
    id: point.id,
    postalCode: point.plz,
    city: point.city,
    provider: point.provider,
    gasProvider: point.gasProvider,
    stromCt: numberText(point.stromCt),
    stromBaseMonth: numberText(point.stromBaseMonth, 2),
    gasCt: numberText(point.gasCt),
    gasBaseMonth: numberText(point.gasBaseMonth, 2),
    validFrom: point.validFrom,
    sourceUrl: point.sourceUrl,
    lat: point.lat,
    lng: point.lng,
  };
}

/** Formular zu einem Ort ohne Preis: PLZ, Ort und Namensvorschlag schon eingetragen. */
export function draftFromOpen(place: OpenPoint): PriceDraft {
  return {
    ...EMPTY_DRAFT,
    postalCode: place.plz,
    city: place.city,
    provider: place.provider,
    lat: place.lat,
    lng: place.lng,
  };
}

/** "2026-01-01" -> "01.01.2026" */
export function dateLabel(value: string): string {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return d && m && y ? `${d}.${m}.${y}` : value;
}

/** Suche nach dem Preisblatt - jeder Grundversorger muss es online stellen (§ 36 EnWG). */
export function sheetSearch(provider: string, city: string, energy: "Strom" | "Gas"): string {
  const query = `Grundversorgung ${energy} Preisblatt ${provider} ${city}`.replace(/\s+/g, " ").trim();
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
