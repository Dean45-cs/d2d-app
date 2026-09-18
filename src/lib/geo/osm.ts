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

/**
 * Overpass-Server der Reihe nach. Der offizielle Server ist oft ausgelastet -
 * vor allem, wenn die App bei einem Hoster laeuft, dessen Ausgangs-IP sich
 * viele teilen. Dann wird der naechste Spiegel genommen.
 * Eigene Adressen (auch mehrere, mit Komma getrennt) ueber OVERPASS_URL.
 */
const OVERPASS_URLS = (
  process.env.OVERPASS_URL ??
  [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ].join(",")
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const NOMINATIM_URL = (process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const COUNTRY_CODES = process.env.GEO_COUNTRY_CODES ?? "de,at,ch";
const USER_AGENT = process.env.GEO_USER_AGENT ?? "d2d-app (Gebietsplanung; https://github.com/)";

/** Strassenarten, an denen Menschen wohnen - Autobahnen und Feldwege fliegen raus. */
const STREET_TYPES = "residential|living_street|pedestrian|unclassified|tertiary|secondary|primary|road";

const MAX_STREETS = 400;
/** Hausnummern je Strasse und insgesamt - eine Grenze gegen Ausreisser. */
const MAX_NUMBERS_PER_STREET = 500;
const MAX_NUMBERS_TOTAL = 8000;

/** Ein einzelnes Haus: Nummer, Wohneinheiten und Lage. */
export interface FoundAddress {
  number: string;
  /** Wohneinheiten laut OSM, 0 = unbekannt. */
  units: number;
  lat: number | null;
  lng: number | null;
}

export interface FoundStreet {
  name: string;
  /** Spanne fuer die Anzeige, z. B. "1-45". */
  houseNumbers: string;
  units: number;
  addresses: number;
  lat: number | null;
  lng: number | null;
  /** Jede gefundene Hausnummer einzeln - daraus wird die Liste an der Tür. */
  numbers: FoundAddress[];
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
    `[out:json][timeout:40];` +
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

/** Zeit je Versuch. Eine uebliche Antwort kommt in wenigen Sekunden. */
const OVERPASS_TIMEOUT_MS = 35_000;

/** Der Server, der zuletzt geantwortet hat - beim naechsten Mal zuerst gefragt. */
let preferredServer = 0;

/**
 * Fragt die Overpass-Server der Reihe nach, bis einer antwortet.
 * Ueberlastung (429) und Zeitueberschreitungen sind kein Grund aufzugeben,
 * ein fehlerhafter Abfragetext dagegen schon.
 */
async function overpass(query: string): Promise<OverpassElement[]> {
  let lastProblem = "";

  for (let attempt = 0; attempt < OVERPASS_URLS.length; attempt += 1) {
    const index = (preferredServer + attempt) % OVERPASS_URLS.length;
    const url = OVERPASS_URLS[index];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": USER_AGENT,
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal,
        cache: "no-store",
      });

      if (response.ok) {
        const data = (await response.json()) as { elements?: OverpassElement[] };
        preferredServer = index;
        return data.elements ?? [];
      }

      // 400 heisst: die Abfrage selbst taugt nichts - da hilft kein anderer Server.
      if (response.status === 400) {
        throw new Error("Die Straßenabfrage wurde abgelehnt. Bitte das Gebiet neu zeichnen.");
      }
      lastProblem = `Fehler ${response.status}`;
      console.warn(`[overpass] ${url}: ${lastProblem}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Die Straßenabfrage")) throw error;
      lastProblem =
        error instanceof Error && error.name === "AbortError"
          ? "keine Antwort"
          : "nicht erreichbar";
      console.warn(`[overpass] ${url}: ${lastProblem}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    `Die Straßen-Server sind gerade alle ausgelastet (zuletzt: ${lastProblem}). ` +
      "In einer Minute noch einmal versuchen – oder die Straßen über „Liste einfügen“ eintragen.",
  );
}

/** Macht aus Overpass-Elementen je Strasse eine Zeile mit allen Hausnummern. */
function groupStreets(elements: OverpassElement[], area: LatLng[]): FoundStreet[] {
  interface Draft {
    name: string;
    /** Hausnummer (normalisiert) -> Haus. Doppelte Treffer fallen so weg. */
    houses: Map<string, FoundAddress>;
    addresses: number;
    latSum: number;
    lngSum: number;
    located: number;
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
        houses: new Map(),
        addresses: 0,
        latSum: 0,
        lngSum: 0,
        located: 0,
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
      if (lat !== null && lng !== null) {
        draft.latSum += lat;
        draft.lngSum += lng;
        draft.located += 1;
      }

      // "12", "12a", aber auch "12;14" oder "12-14" an einem Gebaeude.
      const flats = flatsOf(tags);
      for (const number of splitHouseNumbers(tags["addr:housenumber"])) {
        if (draft.houses.size >= MAX_NUMBERS_PER_STREET && !draft.houses.has(number.key)) continue;
        const existing = draft.houses.get(number.key);
        if (existing) {
          // Dieselbe Nummer zweimal (Knoten und Gebaeude): bessere Angabe behalten.
          if (existing.units === 0) existing.units = flats;
          if (existing.lat === null && lat !== null) {
            existing.lat = round6(lat);
            existing.lng = lng === null ? null : round6(lng);
          }
          continue;
        }
        draft.houses.set(number.key, {
          number: number.label,
          units: flats,
          lat: lat === null ? null : round6(lat),
          lng: lng === null ? null : round6(lng),
        });
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
    const numbers = [...draft.houses.values()].sort(byHouseNumber);
    streets.push({
      name: draft.name,
      houseNumbers: formatRange(numbers),
      // Wohneinheiten aus den Haeusern; ohne Angabe zaehlt jedes Haus als eines.
      units: numbers.reduce((sum, house) => sum + (house.units || 1), 0),
      addresses: draft.addresses,
      lat: draft.located > 0 ? round6(draft.latSum / draft.located) : draft.roadLat,
      lng: draft.located > 0 ? round6(draft.lngSum / draft.located) : draft.roadLng,
      numbers,
    });
  }

  const ranked = streets
    .sort((a, b) => b.addresses - a.addresses || a.name.localeCompare(b.name, "de-DE"))
    .slice(0, MAX_STREETS)
    .sort((a, b) => a.name.localeCompare(b.name, "de-DE"));

  return capNumbers(ranked);
}

/**
 * Notbremse fuer Ausreisser: mehr als achttausend Hausnummern auf einmal
 * braucht kein Tagesgebiet. Die Zaehlung bleibt richtig, nur die Einzelliste
 * wird ab da nicht weitergefuehrt.
 */
function capNumbers(streets: FoundStreet[]): FoundStreet[] {
  let budget = MAX_NUMBERS_TOTAL;
  return streets.map((street) => {
    if (budget <= 0) return { ...street, numbers: [] };
    if (street.numbers.length <= budget) {
      budget -= street.numbers.length;
      return street;
    }
    const numbers = street.numbers.slice(0, budget);
    budget = 0;
    return { ...street, numbers };
  });
}

/** Sortiert wie im Briefkasten: 2 vor 10, 12 vor 12a. */
function byHouseNumber(a: FoundAddress, b: FoundAddress): number {
  const parse = (value: string) => {
    const match = value.match(/^(\d+)\s*(.*)$/);
    return match ? { value: Number(match[1]), suffix: match[2] } : { value: 0, suffix: value };
  };
  const left = parse(a.number);
  const right = parse(b.number);
  return left.value - right.value || left.suffix.localeCompare(right.suffix, "de-DE");
}

/** Wohneinheiten aus den OSM-Tags/** Wohneinheiten aus den OSM-Tags, sonst zaehlt die Adresse als eine Tuer. */
function flatsOf(tags: Record<string, string>): number {
  const flats = Number(tags["building:flats"] ?? tags["addr:flats"] ?? "");
  return Number.isFinite(flats) && flats > 0 ? Math.min(flats, 500) : 1;
}

/** "12a", "12-14", "12;14" -> einzelne Hausnummern. */
function splitHouseNumbers(raw: string): Array<{ key: string; label: string }> {
  const parts = raw
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 12);

  const out: Array<{ key: string; label: string }> = [];
  for (const part of parts) {
    // "12-16" an einem Gebaeude: die Nummern dazwischen gehoeren dazu, aber
    // nur in vernuenftigem Abstand und in derselben Schrittweite (gerade/ungerade).
    const span = part.match(/^(\d{1,4})\s*[-–]\s*(\d{1,4})$/);
    if (span) {
      const from = Number(span[1]);
      const to = Number(span[2]);
      if (to > from && to - from <= 20) {
        const step = (to - from) % 2 === 0 ? 2 : 1;
        for (let n = from; n <= to; n += step) out.push({ key: String(n), label: String(n) });
        continue;
      }
    }
    const match = part.match(/^(\d{1,4})\s*([a-zA-Z]?)/);
    if (!match) continue;
    const label = `${match[1]}${(match[2] ?? "").toLowerCase()}`;
    out.push({ key: label, label });
  }
  return out;
}

/** Aus allen Hausnummern wird die Spanne, die im Gebiet abzuarbeiten ist. */
function formatRange(numbers: FoundAddress[]): string {
  if (numbers.length === 0) return "";
  const first = numbers[0].number;
  const last = numbers[numbers.length - 1].number;
  return first === last ? first : `${first}-${last}`;
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
export function geoSources(): { overpass: string[]; nominatim: string } {
  return { overpass: OVERPASS_URLS, nominatim: NOMINATIM_URL };
}

/** Kartenausschnitt einer Flaeche - fuer das Zoomen nach dem Laden. */
export function areaBounds(area: LatLng[]): [number, number, number, number] {
  const b = boundsOf(area);
  return [b.south, b.west, b.north, b.east];
}
