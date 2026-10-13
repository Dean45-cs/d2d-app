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

import { boundsOf, centerOf, type LatLng } from "./area";
import { mainRing, type Shape } from "./shape";
import {
  DEFAULT_OVERPASS_URLS,
  EMPTY_PLACE,
  checkAreaSize,
  cityOf,
  placeFromAddress,
  queryOverpass,
  streetQuery,
  streetsFromElements,
  type AreaStreets,
  type NominatimAddress,
  type PlaceInfo,
} from "./osm-streets";

export type { AreaStreets, FoundAddress, FoundStreet, PlaceInfo } from "./osm-streets";

/**
 * Wert aus der Umgebung - eine leer gelassene Zeile ("OVERPASS_URL=") zaehlt
 * als nicht gesetzt. Sonst stuende die App ohne einen einzigen Server da.
 */
function env(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

/**
 * Overpass-Server der Reihe nach. Der offizielle Server ist oft ausgelastet -
 * vor allem, wenn die App bei einem Hoster laeuft, dessen Ausgangs-IP sich
 * viele teilen. Dann wird der naechste Spiegel genommen.
 * Eigene Adressen (auch mehrere, mit Komma getrennt) ueber OVERPASS_URL.
 */
const CONFIGURED_OVERPASS_URLS = env("OVERPASS_URL", "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const OVERPASS_URLS =
  CONFIGURED_OVERPASS_URLS.length > 0 ? CONFIGURED_OVERPASS_URLS : DEFAULT_OVERPASS_URLS;
const NOMINATIM_URL = env("NOMINATIM_URL", "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const COUNTRY_CODES = env("GEO_COUNTRY_CODES", "de,at,ch");
const USER_AGENT = env("GEO_USER_AGENT", "d2d-app (Gebietsplanung; https://github.com/)");

/* ------------------------------- Overpass -------------------------------- */

/* Overpass ist langsam und gedrosselt. Wer eine Flaeche zuschneidet, laedt sie
   mehrfach - ein kurzer Zwischenspeicher spart dem Dienst die Arbeit. */
const STREET_CACHE_TTL_MS = 5 * 60 * 1000;
const STREET_CACHE_MAX = 20;
const streetCache = new Map<string, { at: number; value: AreaStreets }>();

/** Der Server, der zuletzt geantwortet hat - beim naechsten Mal zuerst gefragt. */
let preferredServer = 0;

function areaKey(area: Shape): string {
  return area
    .map((polygon) =>
      polygon
        .map((ring) => ring.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(";"))
        .join("|"),
    )
    .join("/");
}

/**
 * Alle Strassen samt Hausnummern innerhalb der gezeichneten Flaeche. Die
 * Flaeche darf aus mehreren Teilen bestehen und Loecher haben (ausgesparte
 * Nachbargebiete) - deren Haeuser bleiben draussen.
 */
export async function streetsInArea(area: Shape): Promise<AreaStreets> {
  const key = areaKey(area);
  const cached = streetCache.get(key);
  if (cached && Date.now() - cached.at < STREET_CACHE_TTL_MS) return cached.value;

  const size = checkAreaSize(area);

  // Strassen und Ortsname gleichzeitig holen - hintereinander addieren sich die Wartezeiten.
  const [{ elements, server }, place] = await Promise.all([
    queryOverpass(OVERPASS_URLS, streetQuery(area), {
      headers: { "user-agent": USER_AGENT },
      startAt: preferredServer,
    }),
    describePlaceQuickly(centerOf(mainRing(area) ?? area[0][0])),
  ]);
  preferredServer = server;
  const { streets, addressCount } = streetsFromElements(elements, area);

  const result: AreaStreets = { streets, addressCount, place, areaSqKm: size };
  if (streetCache.size >= STREET_CACHE_MAX) streetCache.clear();
  streetCache.set(key, { at: Date.now(), value: result });
  return result;
}

/** Der Ortsname ist nur Beiwerk - dafuer wartet niemand laenger. */
const PLACE_TIMEOUT_MS = 8_000;

/** Wie describePlace, gibt aber nach kurzer Zeit leer auf, statt die Straßensuche aufzuhalten. */
async function describePlaceQuickly(center: LatLng): Promise<PlaceInfo> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const giveUp = new Promise<PlaceInfo>((resolve) => {
    timer = setTimeout(() => resolve(EMPTY_PLACE), PLACE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([describePlace(center), giveUp]);
  } finally {
    clearTimeout(timer);
  }
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
    return placeFromAddress(hit?.address);
  } catch {
    // Ohne Ortsnamen laesst sich das Gebiet trotzdem anlegen.
    return EMPTY_PLACE;
  }
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
