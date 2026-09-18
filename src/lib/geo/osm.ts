/**
 * OpenStreetMap als Quelle fuer die Gebietseinteilung.
 *
 * - Overpass liefert alle Strassen und Hausnummern innerhalb einer gezeichneten
 *   Flaeche. Daraus entsteht die Strassenliste eines Gebiets.
 * - Nominatim uebersetzt die Ortssuche in Koordinaten und liefert umgekehrt
 *   PLZ und Ort zur Mitte des Gebiets.
 *
 * Beide Dienste sind ueber .env austauschbar (eigene Instanz, kommerzieller
 * Anbieter). Fuer die oeffentlichen Server gilt: hoeflich sein - ein Aufruf pro
 * Sekunde, eigener User-Agent, Ergebnisse zwischenspeichern.
 */

import {
  MAX_AREA_SQKM,
  areaSqKm,
  boundsOf,
  centerOf,
  contains,
  toOverpassPoly,
  type LatLng,
} from "./area";

const OVERPASS_URL = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = (process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const COUNTRY_CODES = process.env.GEO_COUNTRY_CODES ?? "de,at,ch";
const USER_AGENT = process.env.GEO_USER_AGENT ?? "d2d-app (Gebietsplanung; https://github.com/)";

/** Strassenarten, an denen Menschen wohnen - Autobahnen und Feldwege fliegen raus. */
const STREET_TYPES = "residential|living_street|pedestrian|unclassified|tertiary|secondary|primary|road";

const MAX_STREETS = 400;
/** Punkte je Strasse und insgesamt - die Vorschau soll leicht bleiben. */
const MAX_POINTS_PER_STREET = 160;
const MAX_POINTS_TOTAL = 4000;

export interface FoundStreet {
  name: string;
  houseNumbers: string;
  units: number;
  addresses: number;
  lat: number | null;
  lng: number | null;
  /** Lage der gefundenen Hausnummern - die Vorschau zeigt damit die echten Tueren. */
  points: LatLng[];
}

export interface AreaStreets {
  streets: FoundStreet[];
  addressCount: number;
  place: PlaceInfo;
  areaSqKm: number;
}

export interface PlaceInfo {
  city: string;
  postalCode: string;
  district: string;
}

/* ------------------------------- Overpass -------------------------------- */

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/* Overpass ist langsam und gedrosselt. Wer eine Flaeche zuschneidet, laedt sie
   mehrfach - ein kurzer Zwischenspeicher spart dem Dienst die Arbeit. */
const STREET_CACHE_TTL_MS = 5 * 60 * 1000;
const STREET_CACHE_MAX = 20;
const streetCache = new Map<string, { at: number; value: AreaStreets }>();

function areaKey(area: LatLng[]): string {
  return area.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(";");
}

/** Alle Strassen samt Hausnummern innerhalb der gezeichneten Flaeche. */
export async function streetsInArea(area: LatLng[]): Promise<AreaStreets> {
  const key = areaKey(area);
  const cached = streetCache.get(key);
  if (cached && Date.now() - cached.at < STREET_CACHE_TTL_MS) return cached.value;

  const size = areaSqKm(area);
  if (size > MAX_AREA_SQKM) {
    throw new Error(
      `Das Gebiet ist mit ${size.toFixed(1)} km² zu groß (max. ${MAX_AREA_SQKM} km²). ` +
        "Bitte kleiner zeichnen – ein Tagesgebiet sind meist ein bis zwei Quadratkilometer.",
    );
  }

  const poly = toOverpassPoly(area);
  const query =
    `[out:json][timeout:60];` +
    `way["highway"~"^(${STREET_TYPES})$"]["name"](poly:"${poly}");out tags center;` +
    `(node["addr:housenumber"](poly:"${poly}");way["addr:housenumber"](poly:"${poly}"););out tags center;`;

  const elements = await overpass(query);
  const streets = groupStreets(elements, area);
  const addressCount = streets.reduce((sum, s) => sum + s.addresses, 0);
  const place = await describePlace(centerOf(area));

  const result: AreaStreets = { streets, addressCount, place, areaSqKm: size };
  if (streetCache.size >= STREET_CACHE_MAX) streetCache.clear();
  streetCache.set(key, { at: Date.now(), value: result });
  return result;
}

async function overpass(query: string): Promise<OverpassElement[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75_000);
  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": USER_AGENT,
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        response.status === 429 || response.status === 504
          ? "Der Straßen-Dienst ist gerade überlastet. Bitte in einer Minute noch einmal versuchen."
          : `Straßen konnten nicht geladen werden (Fehler ${response.status}).`,
      );
    }
    const data = (await response.json()) as { elements?: OverpassElement[] };
    return data.elements ?? [];
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Der Straßen-Dienst antwortet nicht. Bitte noch einmal versuchen.");
    }
    if (error instanceof Error && error.message.includes("Straßen")) throw error;
    throw new Error(
      "OpenStreetMap ist nicht erreichbar. Die Straßen lassen sich solange von Hand eintragen.",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Macht aus Overpass-Elementen je Strasse eine Zeile mit Hausnummern und Einheiten. */
function groupStreets(elements: OverpassElement[], area: LatLng[]): FoundStreet[] {
  interface Draft {
    name: string;
    numbers: Array<{ value: number; suffix: string; raw: string }>;
    units: number;
    addresses: number;
    latSum: number;
    lngSum: number;
    /** Koordinaten der Hausnummern, fuer die Vorschau auf der Karte. */
    points: LatLng[];
    roadLat: number | null;
    roadLng: number | null;
  }
  const drafts = new Map<string, Draft>();

  const draftFor = (name: string): Draft => {
    const key = name.toLocaleLowerCase("de-DE");
    let draft = drafts.get(key);
    if (!draft) {
      draft = {
        name,
        numbers: [],
        units: 0,
        addresses: 0,
        latSum: 0,
        lngSum: 0,
        points: [],
        roadLat: null,
        roadLng: null,
      };
      drafts.set(key, draft);
    }
    return draft;
  };

  for (const element of elements) {
    const tags = element.tags ?? {};
    const lat = element.lat ?? element.center?.lat ?? null;
    const lng = element.lon ?? element.center?.lon ?? null;

    if (tags["addr:housenumber"]) {
      const streetName = tags["addr:street"]?.trim();
      if (!streetName) continue;
      // Overpass liefert auch Treffer knapp ausserhalb; hier bleibt nur, was
      // wirklich in der gezeichneten Flaeche liegt.
      if (lat !== null && lng !== null && !contains(area, [lat, lng])) continue;

      const draft = draftFor(streetName);
      draft.addresses += 1;
      draft.units += flatsOf(tags);
      for (const number of splitHouseNumbers(tags["addr:housenumber"])) {
        draft.numbers.push(number);
      }
      if (lat !== null && lng !== null) {
        draft.latSum += lat;
        draft.lngSum += lng;
        if (draft.points.length < MAX_POINTS_PER_STREET) {
          draft.points.push([round6(lat), round6(lng)]);
        }
      }
      continue;
    }

    if (tags.highway && tags.name) {
      const draft = draftFor(tags.name.trim());
      if (draft.roadLat === null && lat !== null && lng !== null) {
        draft.roadLat = lat;
        draft.roadLng = lng;
      }
    }
  }

  const streets: FoundStreet[] = [];
  for (const draft of drafts.values()) {
    const located = draft.points.length;
    streets.push({
      name: draft.name,
      houseNumbers: formatRange(draft.numbers),
      units: draft.units,
      addresses: draft.addresses,
      lat: located > 0 ? round6(draft.latSum / located) : draft.roadLat,
      lng: located > 0 ? round6(draft.lngSum / located) : draft.roadLng,
      points: draft.points,
    });
  }

  const ranked = streets
    .sort((a, b) => b.addresses - a.addresses || a.name.localeCompare(b.name, "de-DE"))
    .slice(0, MAX_STREETS)
    .sort((a, b) => a.name.localeCompare(b.name, "de-DE"));

  return thinPoints(ranked);
}

/**
 * Deckelt die Zahl der Vorschaupunkte. In dichten Innenstaedten kommen sonst
 * Zehntausende Adressen zusammen - sichtbar waere davon nichts, die Karte
 * wuerde aber ruckeln.
 */
function thinPoints(streets: FoundStreet[]): FoundStreet[] {
  const total = streets.reduce((sum, s) => sum + s.points.length, 0);
  if (total <= MAX_POINTS_TOTAL) return streets;
  const keepEvery = Math.ceil(total / MAX_POINTS_TOTAL);
  return streets.map((street) => ({
    ...street,
    points: street.points.filter((_, index) => index % keepEvery === 0),
  }));
}

/** Wohneinheiten aus den OSM-Tags, sonst zaehlt die Adresse als eine Tuer. */
function flatsOf(tags: Record<string, string>): number {
  const flats = Number(tags["building:flats"] ?? tags["addr:flats"] ?? "");
  return Number.isFinite(flats) && flats > 0 ? Math.min(flats, 500) : 1;
}

/** "12a", "12-14", "12;14" -> einzelne Hausnummern. */
function splitHouseNumbers(raw: string): Array<{ value: number; suffix: string; raw: string }> {
  return raw
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((part) => {
      const match = part.match(/^(\d{1,4})\s*([a-zA-Z]?)/);
      if (!match) return null;
      return { value: Number(match[1]), suffix: match[2] ?? "", raw: part };
    })
    .filter((n): n is { value: number; suffix: string; raw: string } => n !== null);
}

/** Aus allen Hausnummern wird die Spanne, die im Gebiet abzuarbeiten ist. */
function formatRange(numbers: Array<{ value: number; suffix: string; raw: string }>): string {
  if (numbers.length === 0) return "";
  const sorted = [...numbers].sort((a, b) => a.value - b.value || a.suffix.localeCompare(b.suffix));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first.value === last.value && first.suffix === last.suffix) return `${first.value}${first.suffix}`;
  return `${first.value}${first.suffix}-${last.value}${last.suffix}`;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/* ------------------------------- Nominatim ------------------------------- */

export interface PlaceHit {
  label: string;
  lat: number;
  lng: number;
  /** Kartenausschnitt des Treffers: [sued, west, nord, ost] */
  bounds: [number, number, number, number] | null;
  postalCode: string;
  city: string;
}

interface NominatimAddress {
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  suburb?: string;
  city_district?: string;
  borough?: string;
  neighbourhood?: string;
  quarter?: string;
}

interface NominatimHit {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: [string, string, string, string];
  address?: NominatimAddress;
}

/** Ortssuche fuer das Suchfeld ueber der Karte. */
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const url =
    `${NOMINATIM_URL}/search?format=jsonv2&addressdetails=1&limit=6` +
    `&countrycodes=${encodeURIComponent(COUNTRY_CODES)}&q=${encodeURIComponent(query)}`;
  const hits = (await nominatim<NominatimHit[]>(url, `search:${query.toLowerCase()}`)) ?? [];

  return hits
    .filter((hit) => hit.lat && hit.lon)
    .map((hit) => ({
      label: hit.display_name ?? hit.name ?? "",
      lat: Number(hit.lat),
      lng: Number(hit.lon),
      bounds: hit.boundingbox
        ? ([
            Number(hit.boundingbox[0]),
            Number(hit.boundingbox[2]),
            Number(hit.boundingbox[1]),
            Number(hit.boundingbox[3]),
          ] as [number, number, number, number])
        : null,
      postalCode: hit.address?.postcode ?? "",
      city: cityOf(hit.address),
    }));
}

/** PLZ, Ort und Stadtteil zur Mitte des Gebiets - fuellt das Formular vor. */
export async function describePlace(center: LatLng): Promise<PlaceInfo> {
  const [lat, lng] = center;
  const url =
    `${NOMINATIM_URL}/reverse?format=jsonv2&addressdetails=1&zoom=16` +
    `&lat=${lat}&lon=${lng}`;
  try {
    const hit = await nominatim<NominatimHit>(url, `reverse:${lat.toFixed(3)},${lng.toFixed(3)}`);
    return {
      city: cityOf(hit?.address),
      postalCode: hit?.address?.postcode ?? "",
      district:
        hit?.address?.suburb ??
        hit?.address?.city_district ??
        hit?.address?.borough ??
        hit?.address?.quarter ??
        hit?.address?.neighbourhood ??
        "",
    };
  } catch {
    // Ohne Ortsnamen laesst sich das Gebiet trotzdem anlegen.
    return { city: "", postalCode: "", district: "" };
  }
}

function cityOf(address: NominatimAddress | undefined): string {
  return address?.city ?? address?.town ?? address?.village ?? address?.municipality ?? "";
}

/* -- Zwischenspeicher und Warteschlange: der oeffentliche Nominatim-Server -- */
/*    erlaubt hoechstens eine Anfrage pro Sekunde.                            */

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const MIN_INTERVAL_MS = 1100;

const cache = new Map<string, { at: number; value: unknown }>();
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

async function nominatim<T>(url: string, cacheKey: string): Promise<T | null> {
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value as T;

  const run = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCall);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCall = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, "accept-language": "de" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Ortssuche fehlgeschlagen (Fehler ${response.status}).`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  });

  // Die Warteschlange darf nicht an einem Fehler haengenbleiben.
  queue = run.catch(() => undefined);

  try {
    const value = await run;
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Die Ortssuche antwortet nicht. Bitte noch einmal versuchen.");
    }
    if (error instanceof Error && error.message.startsWith("Ortssuche")) throw error;
    throw new Error("Die Ortssuche ist nicht erreichbar.");
  }
}

/** Nur fuer die Anzeige in den Einstellungen. */
export function geoSources(): { overpass: string; nominatim: string } {
  return { overpass: OVERPASS_URL, nominatim: NOMINATIM_URL };
}

/** Kartenausschnitt einer Flaeche - fuer das Zoomen nach dem Laden. */
export function areaBounds(area: LatLng[]): [number, number, number, number] {
  const b = boundsOf(area);
  return [b.south, b.west, b.north, b.east];
}
