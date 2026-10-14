/**
 * Strassen und Hausnummern aus Overpass - der Teil, der auf dem Server und im
 * Browser gleich laeuft: Abfrage bauen, Server anfragen, Ergebnis gruppieren.
 *
 * Warum auch im Browser? Overpass begrenzt die Abfragen je IP-Adresse. Bei
 * Hostern wie Fly.io teilen sich viele Kunden eine Ausgangs-IP, deren
 * Kontingent dann oft schon verbraucht ist - der Server bekommt nur noch 429.
 * Das Handy fragt mit seiner eigenen Adresse und kommt durch.
 */

import { MAX_AREA_SQKM, contains, toOverpassPoly, type LatLng } from "./area";
import { shapeContains, shapeSqm, type Shape } from "./shape";

/** Oeffentliche Overpass-Server. Alle erlauben Abfragen direkt aus dem Browser (CORS). */
export const DEFAULT_OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

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
  /** Woher die Liste stammt - aus den Kartenkacheln ist die Zuordnung der Nummern geschaetzt. */
  source?: StreetSource;
}

/** Overpass (Hausnummern mit Strasse) oder die Vektorkacheln der Karte (naechste Strasse). */
export type StreetSource = "overpass" | "tiles";

export interface PlaceInfo {
  city: string;
  postalCode: string;
  district: string;
}

/* ------------------------------- Overpass -------------------------------- */

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Groesse der Flaeche in km² - zu grosse Flaechen werden gar nicht erst abgefragt. */
export function checkAreaSize(area: Shape): number {
  const size = shapeSqm(area) / 1_000_000;
  if (size > MAX_AREA_SQKM) {
    throw new Error(
      `Das Gebiet ist mit ${size.toFixed(1)} km² zu groß (max. ${MAX_AREA_SQKM} km²). ` +
        "Bitte kleiner zeichnen – ein Tagesgebiet sind meist ein bis zwei Quadratkilometer.",
    );
  }
  return size;
}

/** Overpass-Abfrage: benannte Strassen und alle Hausnummern in der Flaeche. */
export function streetQuery(area: Shape): string {
  // Overpass fragt je Teil den Aussenumriss ab; Loecher filtert groupStreets.
  const polys = area.map(([outer]) => toOverpassPoly(outer));
  const roads = polys
    .map((poly) => `way["highway"~"^(${STREET_TYPES})$"]["name"](poly:"${poly}");`)
    .join("");
  const houses = polys
    .map(
      (poly) => `node["addr:housenumber"](poly:"${poly}");way["addr:housenumber"](poly:"${poly}");`,
    )
    .join("");
  return `[out:json][timeout:25];(${roads});out tags center;(${houses});out tags center;`;
}

/** Zeit je Versuch. Eine uebliche Antwort kommt in wenigen Sekunden. */
const OVERPASS_TIMEOUT_MS = 25_000;
/** Antwortet ein Server so lange nicht, wird zusaetzlich der naechste gefragt. */
const OVERPASS_HEDGE_MS = 7_000;

/** Die Abfrage selbst ist fehlerhaft - ein anderer Server hilft nicht. */
export class QueryRejected extends Error {}

async function overpassAttempt(
  url: string,
  query: string,
  controller: AbortController,
  headers: Record<string, string>,
): Promise<OverpassElement[]> {
  const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      // Nur ein "einfacher" Inhaltstyp - so fragt der Browser nicht erst per OPTIONS nach.
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.status === 400) {
      throw new QueryRejected("Die Straßenabfrage wurde abgelehnt. Bitte das Gebiet neu zeichnen.");
    }
    if (!response.ok) throw new Error(`Fehler ${response.status}`);

    const data = (await response.json()) as { elements?: OverpassElement[]; remark?: string };
    // Overpass meldet Zeitueberschreitung und Speichermangel mit Status 200 und
    // einer Bemerkung - das Ergebnis ist dann leer oder unvollstaendig.
    if (data.remark && /runtime error/i.test(data.remark)) throw new Error("Server überlastet");
    return data.elements ?? [];
  } finally {
    clearTimeout(timer);
  }
}

export interface OverpassOptions {
  /** Zusaetzliche Kopfzeilen, etwa der User-Agent des Servers. */
  headers?: Record<string, string>;
  /** Mit diesem Server anfangen (der zuletzt geantwortet hat). */
  startAt?: number;
  /** Bricht alle laufenden Anfragen ab - etwa wenn die Kartendaten schneller waren. */
  signal?: AbortSignal;
}

/**
 * Fragt die Overpass-Server ab. Antwortet der erste nicht binnen weniger
 * Sekunden (oder mit einem Fehler), kommt der naechste dazu - die schnellste
 * Antwort gewinnt. So wartet niemand nacheinander auf drei Zeitueberschreitungen.
 */
export function queryOverpass(
  urls: string[],
  query: string,
  { headers = {}, startAt = 0, signal }: OverpassOptions = {},
): Promise<{ elements: OverpassElement[]; server: number }> {
  const total = urls.length;
  const controllers: AbortController[] = [];
  // Ohne Server kaeme nie eine Antwort - lieber gleich sagen, was fehlt.
  if (total === 0) return Promise.reject(new Error("Kein Straßen-Server eingerichtet (OVERPASS_URL)."));
  if (signal?.aborted) return Promise.reject(new Error("Straßenabfrage abgebrochen."));

  return new Promise((resolve, reject) => {
    let settled = false;
    let started = 0;
    let failed = 0;
    let lastProblem = "";
    let hedge: ReturnType<typeof setTimeout> | undefined;

    const finish = (done: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedge);
      signal?.removeEventListener("abort", cancel);
      for (const controller of controllers) controller.abort();
      done();
    };
    const cancel = () => finish(() => reject(new Error("Straßenabfrage abgebrochen.")));
    signal?.addEventListener("abort", cancel, { once: true });

    const launch = () => {
      if (settled || started >= total) return;
      const index = (startAt + started) % total;
      const url = urls[index];
      const controller = new AbortController();
      controllers.push(controller);
      started += 1;

      clearTimeout(hedge);
      if (started < total) hedge = setTimeout(launch, OVERPASS_HEDGE_MS);

      overpassAttempt(url, query, controller, headers).then(
        (elements) => finish(() => resolve({ elements, server: index })),
        (error: unknown) => {
          if (settled) return;
          if (error instanceof QueryRejected) {
            finish(() => reject(error));
            return;
          }
          lastProblem =
            error instanceof Error && error.name === "AbortError"
              ? "keine Antwort"
              : error instanceof Error && error.message
                ? error.message
                : "nicht erreichbar";
          console.warn(`[overpass] ${url}: ${lastProblem}`);
          failed += 1;
          if (failed >= total) {
            finish(() =>
              reject(
                new Error(
                  `Die Straßen-Server sind gerade alle ausgelastet (zuletzt: ${lastProblem}). ` +
                    "In einer Minute noch einmal versuchen – oder die Straßen über „Liste einfügen“ eintragen.",
                ),
              ),
            );
          } else {
            launch();
          }
        },
      );
    };

    launch();
  });
}

/** Strassen gruppieren und zaehlen - das fertige Ergebnis ohne Ortsangabe. */
export function streetsFromElements(
  elements: OverpassElement[],
  area: Shape,
): { streets: FoundStreet[]; addressCount: number } {
  const streets = groupStreets(elements, area);
  return { streets, addressCount: streets.reduce((sum, s) => sum + s.addresses, 0) };
}

/** Macht aus Overpass-Elementen je Strasse eine Zeile mit allen Hausnummern. */
export function groupStreets(elements: OverpassElement[], area: Shape): FoundStreet[] {
  interface Draft {
    name: string;
    /** Hausnummer (normalisiert) -> Haus. Doppelte Treffer fallen so weg. */
    houses: Map<string, FoundAddress>;
    addresses: number;
    /** Haeuser in einem ausgesparten Nachbargebiet - die Strasse gehoert dann dorthin. */
    elsewhere: number;
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
        elsewhere: 0,
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
      if (lat !== null && lng !== null && !shapeContains(area, [lat, lng])) {
        if (inHole(area, [lat, lng])) draftFor(streetName).elsewhere += 1;
        continue;
      }

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
    // Liegt die Strasse ganz in einem ausgesparten Nachbargebiet, gehoert sie
    // dorthin - auch wenn ihr Strassenzug die Flaeche streift.
    if (draft.addresses === 0) {
      if (draft.elsewhere > 0) continue;
      const road: LatLng | null =
        draft.roadLat !== null && draft.roadLng !== null ? [draft.roadLat, draft.roadLng] : null;
      if (road && inHole(area, road)) continue;
    }
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

/** Liegt der Punkt in einem Loch der Flaeche, also in einem ausgesparten Gebiet? */
function inHole(area: Shape, point: LatLng): boolean {
  return area.some(
    ([outer, ...holes]) =>
      outer !== undefined && contains(outer, point) && holes.some((hole) => contains(hole, point)),
  );
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


/* --------------------------- Ort aus Nominatim --------------------------- */

export interface NominatimAddress {
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

export function cityOf(address: NominatimAddress | undefined): string {
  return address?.city ?? address?.town ?? address?.village ?? address?.municipality ?? "";
}

/** PLZ, Ort und Stadtteil aus einer Nominatim-Adresse. */
export function placeFromAddress(address: NominatimAddress | undefined): PlaceInfo {
  return {
    city: cityOf(address),
    postalCode: address?.postcode ?? "",
    district:
      address?.suburb ??
      address?.city_district ??
      address?.borough ??
      address?.quarter ??
      address?.neighbourhood ??
      "",
  };
}

export const EMPTY_PLACE: PlaceInfo = { city: "", postalCode: "", district: "" };
