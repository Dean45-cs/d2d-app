/**
 * Strassen und Hausnummern aus den Vektorkacheln von OpenFreeMap.
 *
 * Der zweite Weg neben Overpass: Die oeffentlichen Overpass-Server sind oft
 * ueberlastet und lehnen dann ab oder antworten gar nicht. Die Kacheln kommen
 * dagegen von einem CDN ohne Limit - es sind dieselben, die die Karte zeigt.
 *
 * In den Kacheln (OpenMapTiles-Schema, Zoomstufe 14) stehen Strassennamen
 * (Ebene "transportation_name") und Hausnummern (Ebene "housenumber"), aber
 * nicht, zu welcher Strasse eine Hausnummer gehoert. Jede Nummer kommt deshalb
 * an die naechste benannte Strasse. Das stimmt fast immer; an Ecken kann eine
 * Nummer bei der Nachbarstrasse landen.
 *
 * Heraus kommen Elemente in der Form, die Overpass liefert - so laeuft das
 * Gruppieren (groupStreets) fuer beide Quellen gleich.
 */

import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { METERS_PER_DEGREE, contains, type LatLng } from "./area";
import type { OverpassElement } from "./osm-streets";
import { shapeBounds, shapeContains, type Shape } from "./shape";

/** TileJSON der OpenFreeMap-Planetenkacheln (dieselbe Quelle wie der Kartenstil). */
export const DEFAULT_TILEJSON_URL = "https://tiles.openfreemap.org/planet";

/** In Stufe 14 stehen die Hausnummern - darueber gibt es keine eigenen Kacheln. */
const TILE_ZOOM = 14;
/** 25 km² sind auch im Norden keine 40 Kacheln - mehr waere ein Fehler. */
const MAX_TILES = 64;
/** Strassen knapp ausserhalb der Flaeche zaehlen fuer die Zuordnung mit. */
const MARGIN_M = 150;
/** Weiter als das von jeder benannten Strasse: Nummer bleibt ohne Strasse. */
const MAX_ASSIGN_M = 120;
const TIMEOUT_MS = 15_000;

/** Strassenarten, die als eigene Zeile in die Liste kommen - wie STREET_TYPES bei Overpass. */
const LISTED_CLASSES = new Set(["primary", "secondary", "tertiary", "minor"]);
/** An diesen Strassen koennen Haeuser stehen (Autobahnen, Feldwege, Gleise nicht). */
const ADDRESS_CLASSES = new Set([...LISTED_CLASSES, "trunk", "service"]);

function listed(kind: string, subclass: string): boolean {
  return LISTED_CLASSES.has(kind) || (kind === "path" && subclass === "pedestrian");
}

function addressable(kind: string, subclass: string): boolean {
  return ADDRESS_CLASSES.has(kind) || (kind === "path" && subclass === "pedestrian");
}

export interface TileOptions {
  /** TileJSON-Adresse oder direkt eine Vorlage mit {z}/{x}/{y}. */
  source?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

interface Road {
  name: string;
  kind: string;
  subclass: string;
  lines: LatLng[][];
}

interface House {
  number: string;
  point: LatLng;
}

/**
 * Alle benannten Strassen, die die Flaeche beruehren, und alle Hausnummern
 * darin - als Overpass-Elemente.
 */
export async function elementsFromTiles(area: Shape, options: TileOptions = {}): Promise<OverpassElement[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const stop = () => controller.abort();
  options.signal?.addEventListener("abort", stop, { once: true });
  try {
    const { template, maxzoom } = await tileSource(options.source ?? DEFAULT_TILEJSON_URL, options.headers);
    const zoom = Math.min(TILE_ZOOM, maxzoom);
    const bounds = shapeBounds(area);
    const lat0 = (bounds.south + bounds.north) / 2;
    const marginLat = MARGIN_M / METERS_PER_DEGREE;
    const marginLng = MARGIN_M / (METERS_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180));
    const tiles = tilesFor(
      {
        south: bounds.south - marginLat,
        north: bounds.north + marginLat,
        west: bounds.west - marginLng,
        east: bounds.east + marginLng,
      },
      zoom,
    );
    if (tiles.length > MAX_TILES) throw new Error("Die Fläche ist für die Kartendaten zu groß.");

    const roads: Road[] = [];
    const houses: House[] = [];
    await Promise.all(
      tiles.map(async ([x, y]) => {
        const tile = await loadTile(template, zoom, x, y, controller.signal, options.headers);
        if (tile) readTile(tile, zoom, x, y, roads, houses);
      }),
    );
    return toElements(area, roads, houses);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", stop);
  }
}

/* -------------------------------- Laden --------------------------------- */

/** Die Kachel-Adressen wechseln mit jedem Datenstand - die aktuelle steht im TileJSON. */
const sources = new Map<string, Promise<{ template: string; maxzoom: number }>>();

function tileSource(
  url: string,
  headers: Record<string, string> | undefined,
): Promise<{ template: string; maxzoom: number }> {
  if (url.includes("{z}")) return Promise.resolve({ template: url, maxzoom: TILE_ZOOM });
  let pending = sources.get(url);
  if (!pending) {
    pending = (async () => {
      // Eigenes Zeitlimit statt des Abbruchs der Suche: Die Antwort teilen sich
      // alle Suchen, die gerade laufen - bricht eine ab, brauchen die anderen sie noch.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: controller.signal, headers });
        if (!response.ok) throw new Error(`Kartendaten: Fehler ${response.status}`);
        const json = (await response.json()) as { tiles?: unknown; maxzoom?: unknown };
        const template = Array.isArray(json.tiles) ? json.tiles.find((t) => typeof t === "string") : null;
        if (!template) throw new Error("Kartendaten: keine Kachel-Adresse");
        const maxzoom = typeof json.maxzoom === "number" ? json.maxzoom : TILE_ZOOM;
        return { template, maxzoom };
      } finally {
        clearTimeout(timer);
      }
    })();
    sources.set(url, pending);
    // Ein Fehlschlag soll beim naechsten Versuch neu fragen.
    pending.catch(() => sources.delete(url));
  }
  return pending;
}

async function loadTile(
  template: string,
  z: number,
  x: number,
  y: number,
  signal: AbortSignal,
  headers: Record<string, string> | undefined,
): Promise<VectorTile | null> {
  const url = template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  const response = await fetch(url, { signal, headers });
  // Keine Kachel (etwa ueber dem Meer) heisst: hier gibt es nichts.
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Kartendaten: Fehler ${response.status}`);
  let bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) return null;
  // Manche Server liefern die Kachel gepackt, ohne es im Kopf zu sagen.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes);
  return new VectorTile(new Pbf(bytes));
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Kacheln [x, y], die den Ausschnitt abdecken. */
function tilesFor(
  bounds: { south: number; north: number; west: number; east: number },
  zoom: number,
): Array<[number, number]> {
  const [x0, y0] = tileOf(bounds.north, bounds.west, zoom);
  const [x1, y1] = tileOf(bounds.south, bounds.east, zoom);
  const out: Array<[number, number]> = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) out.push([x, y]);
  }
  return out;
}

function tileOf(lat: number, lng: number, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

/* ------------------------------- Auslesen -------------------------------- */

function readTile(tile: VectorTile, z: number, x: number, y: number, roads: Road[], houses: House[]) {
  const n = 2 ** z;
  const toLatLng = (px: number, py: number, extent: number): LatLng => {
    const lng = ((x + px / extent) / n) * 360 - 180;
    const merc = Math.PI * (1 - (2 * (y + py / extent)) / n);
    const lat = (Math.atan(Math.sinh(merc)) * 180) / Math.PI;
    return [round6(lat), round6(lng)];
  };

  const names = tile.layers.transportation_name;
  for (let i = 0; i < (names?.length ?? 0); i += 1) {
    const feature = names.feature(i);
    if (feature.type !== 2) continue;
    const name = text(feature.properties.name);
    const kind = text(feature.properties.class);
    const subclass = text(feature.properties.subclass);
    if (!name || !addressable(kind, subclass)) continue;
    const lines = feature
      .loadGeometry()
      .map((line) => line.map((p) => toLatLng(p.x, p.y, feature.extent)))
      .filter((line) => line.length >= 2);
    if (lines.length > 0) roads.push({ name, kind, subclass, lines });
  }

  const numbers = tile.layers.housenumber;
  for (let i = 0; i < (numbers?.length ?? 0); i += 1) {
    const feature = numbers.feature(i);
    if (feature.type !== 1) continue;
    const number = text(feature.properties.housenumber);
    if (!number) continue;
    for (const ring of feature.loadGeometry()) {
      for (const p of ring) {
        // Punkte im Randstreifen stehen auch in der Nachbarkachel - nur einmal zaehlen.
        if (p.x < 0 || p.y < 0 || p.x >= feature.extent || p.y >= feature.extent) continue;
        houses.push({ number, point: toLatLng(p.x, p.y, feature.extent) });
      }
    }
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/* ------------------------------- Zuordnen -------------------------------- */

interface Segment {
  name: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

function toElements(area: Shape, roads: Road[], houses: House[]): OverpassElement[] {
  const bounds = shapeBounds(area);
  const lat0 = (bounds.south + bounds.north) / 2;
  const mx = METERS_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
  const my = METERS_PER_DEGREE;
  const project = ([lat, lng]: LatLng): [number, number] => [lng * mx, lat * my];

  // Rasterindex der Strassenabschnitte, eine Zelle so gross wie der Suchradius.
  const cell = MAX_ASSIGN_M;
  const grid = new Map<string, Segment[]>();
  for (const road of roads) {
    for (const line of road.lines) {
      for (let i = 1; i < line.length; i += 1) {
        const [ax, ay] = project(line[i - 1]);
        const [bx, by] = project(line[i]);
        const segment: Segment = { name: road.name, ax, ay, bx, by };
        const cx0 = Math.floor(Math.min(ax, bx) / cell);
        const cx1 = Math.floor(Math.max(ax, bx) / cell);
        const cy0 = Math.floor(Math.min(ay, by) / cell);
        const cy1 = Math.floor(Math.max(ay, by) / cell);
        for (let cx = cx0; cx <= cx1; cx += 1) {
          for (let cy = cy0; cy <= cy1; cy += 1) {
            const key = `${cx}:${cy}`;
            const list = grid.get(key);
            if (list) list.push(segment);
            else grid.set(key, [segment]);
          }
        }
      }
    }
  }

  const nearestStreet = (point: LatLng): string | null => {
    const [px, py] = project(point);
    const cx = Math.floor(px / cell);
    const cy = Math.floor(py / cell);
    let best: string | null = null;
    let bestDistance = MAX_ASSIGN_M * MAX_ASSIGN_M;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const s of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const distance = segmentDistanceSq(px, py, s);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = s.name;
          }
        }
      }
    }
    return best;
  };

  const elements: OverpassElement[] = [];
  let id = 1;

  // Strassen, die die Flaeche beruehren - auch solche ohne Hausnummern.
  const seen = new Set<string>();
  for (const road of roads) {
    if (!listed(road.kind, road.subclass)) continue;
    const key = road.name.toLocaleLowerCase("de-DE");
    if (seen.has(key)) continue;
    const inside = pointInArea(area, road.lines);
    if (!inside) continue;
    seen.add(key);
    elements.push({
      type: "way",
      id: id++,
      center: { lat: inside[0], lon: inside[1] },
      tags: { highway: road.kind, name: road.name },
    });
  }

  // Hausnummern in der Flaeche (und in ausgesparten Loechern - groupStreets braucht beides).
  for (const house of houses) {
    const [lat, lng] = house.point;
    if (lat < bounds.south || lat > bounds.north || lng < bounds.west || lng > bounds.east) continue;
    const street = nearestStreet(house.point);
    if (!street) continue;
    elements.push({
      type: "node",
      id: id++,
      lat,
      lon: lng,
      tags: { "addr:housenumber": house.number, "addr:street": street },
    });
  }

  return elements;
}

function segmentDistanceSq(px: number, py: number, s: Segment): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / length));
  const x = s.ax + t * dx - px;
  const y = s.ay + t * dy - py;
  return x * x + y * y;
}

/**
 * Ein Punkt der Strasse innerhalb der Flaeche - oder dort, wo sie den Rand
 * kreuzt. null, wenn sie die Flaeche gar nicht beruehrt.
 */
function pointInArea(area: Shape, lines: LatLng[][]): LatLng | null {
  for (const line of lines) {
    for (const point of line) if (shapeContains(area, point)) return point;
  }
  for (const line of lines) {
    for (let i = 1; i < line.length; i += 1) {
      for (const polygon of area) {
        const outer = polygon[0];
        if (!outer) continue;
        const hit = crossing(line[i - 1], line[i], outer);
        // Den Rand eines Lochs zu kreuzen heisst nicht, in der Flaeche zu sein.
        if (hit && !polygon.slice(1).some((hole) => contains(hole, hit))) return hit;
      }
    }
  }
  return null;
}

/** Schnittpunkt des Abschnitts a-b mit dem Ring, sonst null. */
function crossing(a: LatLng, b: LatLng, ring: LatLng[]): LatLng | null {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const c = ring[j];
    const d = ring[i];
    const r1 = b[0] - a[0];
    const r2 = b[1] - a[1];
    const s1 = d[0] - c[0];
    const s2 = d[1] - c[1];
    const denominator = r1 * s2 - r2 * s1;
    if (denominator === 0) continue;
    const t = ((c[0] - a[0]) * s2 - (c[1] - a[1]) * s1) / denominator;
    const u = ((c[0] - a[0]) * r2 - (c[1] - a[1]) * r1) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return [round6(a[0] + t * r1), round6(a[1] + t * r2)];
  }
  return null;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
