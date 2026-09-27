/**
 * Gebietsflaechen, die sich nicht ueberschneiden.
 *
 * Eine gezeichnete Flaeche ist ein einfacher Ring. Sobald aber vergebene
 * Gebiete davon abgezogen werden, entstehen Loecher (ein altes Gebiet liegt
 * mitten im neuen) oder mehrere Teile (ein altes Gebiet schneidet das neue
 * durch). Deshalb rechnet dieses Modul mit "Formen": einer Liste von
 * Flaechen, jede mit Aussenring und optionalen Loechern - wie ein
 * GeoJSON-MultiPolygon, nur mit [Breitengrad, Laengengrad].
 *
 * Die eigentliche Verschneidung uebernimmt polygon-clipping. Selbst geschrieben
 * sind nur die kleinen Dinge drumherum (Flaeche, Punkt-in-Form, Schildposition).
 */

import polygonClipping from "polygon-clipping";
import { METERS_PER_DEGREE, contains, type LatLng } from "./area";

/** Aussenring zuerst, danach die Loecher. Ringe ohne wiederholten Endpunkt. */
export type Polygon = LatLng[][];
export type Shape = Polygon[];

/** Splitter unter dieser Groesse (m²) sind Zeichenungenauigkeit, kein Gebiet. */
const MIN_PART_SQM = 150;

export function toShape(ring: LatLng[]): Shape {
  return ring.length >= 3 ? [[ring]] : [];
}

export function isEmpty(shape: Shape | null | undefined): boolean {
  return !shape || shape.length === 0;
}

/* ------------------------------ Kennzahlen ------------------------------- */

/** Alle Eckpunkte - zum Einpassen der Karte. */
export function shapePoints(shape: Shape): LatLng[] {
  return shape.flatMap((polygon) => polygon[0] ?? []);
}

export function shapeBounds(shape: Shape): Bounds {
  const bounds: Bounds = { south: 90, north: -90, west: 180, east: -180 };
  for (const polygon of shape) {
    for (const [lat, lng] of polygon[0] ?? []) {
      bounds.south = Math.min(bounds.south, lat);
      bounds.north = Math.max(bounds.north, lat);
      bounds.west = Math.min(bounds.west, lng);
      bounds.east = Math.max(bounds.east, lng);
    }
  }
  return bounds;
}

export interface Bounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.south <= b.north && b.south <= a.north && a.west <= b.east && b.west <= a.east;
}

/** Flaeche in Quadratmetern (Loecher abgezogen). */
export function shapeSqm(shape: Shape): number {
  return shape.reduce((sum, polygon) => sum + polygonSqm(polygon), 0);
}

function polygonSqm(polygon: Polygon): number {
  const [outer, ...holes] = polygon;
  if (!outer) return 0;
  return Math.max(0, ringSqm(outer) - holes.reduce((sum, hole) => sum + ringSqm(hole), 0));
}

function ringSqm(ring: LatLng[]): number {
  if (ring.length < 3) return 0;
  const mx = METERS_PER_DEGREE * Math.cos((ring[0][0] * Math.PI) / 180);
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [lat1, lng1] = ring[i];
    const [lat2, lng2] = ring[(i + 1) % ring.length];
    sum += lng1 * mx * lat2 * METERS_PER_DEGREE - lng2 * mx * lat1 * METERS_PER_DEGREE;
  }
  return Math.abs(sum) / 2;
}

/** Liegt der Punkt in der Form (und nicht in einem ihrer Loecher)? */
export function shapeContains(shape: Shape, point: LatLng): boolean {
  return shape.some(
    ([outer, ...holes]) =>
      outer !== undefined && contains(outer, point) && !holes.some((hole) => contains(hole, point)),
  );
}

/** Der Aussenring des groessten Teils - fuer alles, was nur "ungefaehr wo" braucht. */
export function mainRing(shape: Shape): LatLng[] | null {
  let best: Polygon | null = null;
  let bestSize = -1;
  for (const polygon of shape) {
    const size = polygonSqm(polygon);
    if (size > bestSize) {
      best = polygon;
      bestSize = size;
    }
  }
  return best?.[0] ?? null;
}

/* ----------------------------- Verschneiden ------------------------------ */

type PcGeom = Parameters<typeof polygonClipping.union>[0];

function toPc(shape: Shape): PcGeom {
  return shape.map((polygon) =>
    polygon.map((ring) => ring.map(([lat, lng]) => [lat, lng] as [number, number])),
  );
}

/**
 * Raeumt das Ergebnis auf: Endpunkt weg, auf sechs Stellen runden, Splitter
 * und winzige Loecher verwerfen. Groesste Teile zuerst.
 */
function fromPc(result: ReturnType<typeof polygonClipping.union>): Shape {
  const shape: Shape = [];
  for (const polygon of result) {
    const rings = polygon
      .map((ring) => openRing(ring.map(([lat, lng]) => [round6(lat), round6(lng)] as LatLng)))
      .filter((ring) => ring.length >= 3);
    const [outer, ...holes] = rings;
    if (!outer || ringSqm(outer) < MIN_PART_SQM) continue;
    shape.push([outer, ...holes.filter((hole) => ringSqm(hole) >= MIN_PART_SQM)]);
  }
  return shape.sort((a, b) => polygonSqm(b) - polygonSqm(a));
}

function openRing(ring: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (const point of ring) {
    const last = out[out.length - 1];
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    out.push(point);
  }
  if (out.length > 1) {
    const [first, last] = [out[0], out[out.length - 1]];
    if (first[0] === last[0] && first[1] === last[1]) out.pop();
  }
  return out;
}

/**
 * Macht aus einer frei gezeichneten Flaeche eine saubere Form: Ueberkreuzungen
 * ("Schleife" beim Antippen in falscher Reihenfolge) werden aufgeloest,
 * Stacheln ohne Flaeche fallen weg.
 */
export function normalize(shape: Shape): Shape {
  if (shape.length === 0) return shape;
  try {
    return fromPc(polygonClipping.union(toPc(shape)));
  } catch {
    return shape;
  }
}

/** Form ohne die angegebenen Flaechen. Nur Nachbarn, die sie beruehren, kosten Rechenzeit. */
export function subtract(shape: Shape, others: Shape[]): Shape {
  if (shape.length === 0) return shape;
  const bounds = shapeBounds(shape);
  const touching = others.filter((other) => other.length > 0 && boundsOverlap(bounds, shapeBounds(other)));
  if (touching.length === 0) return normalize(shape);
  try {
    return fromPc(polygonClipping.difference(toPc(shape), ...touching.map(toPc)));
  } catch {
    // polygon-clipping scheitert sehr selten an entarteten Eingaben - dann lieber
    // die Flaeche wie gezeichnet als gar keine.
    return shape;
  }
}

export function intersect(a: Shape, b: Shape): Shape {
  if (a.length === 0 || b.length === 0) return [];
  if (!boundsOverlap(shapeBounds(a), shapeBounds(b))) return [];
  try {
    return fromPc(polygonClipping.intersection(toPc(a), toPc(b)));
  } catch {
    return [];
  }
}

/**
 * Loest Ueberschneidungen fuer die Anzeige auf: Jeder Fleck Boden gehoert
 * genau einem Gebiet. Das kleinere Gebiet gewinnt - so verschwindet ein
 * Gebiet, das in einem groesseren liegt, nie unter diesem, sondern das
 * grosse bekommt dort ein Loch.
 *
 * Liefert je Eingabe die sichtbare Form (in derselben Reihenfolge). Ist von
 * einem Gebiet nichts mehr uebrig, ist seine Form leer.
 */
export function resolveOverlaps(shapes: Shape[]): Shape[] {
  const order = shapes
    .map((raw, index) => {
      // Selbst ueberkreuzte Zeichnungen (aeltere Daten) erst entwirren - sonst
      // passen Loch und Flaeche des Nachbarn nicht zusammen.
      const shape = normalize(raw);
      return { index, shape, size: shapeSqm(shape), bounds: shapeBounds(shape) };
    })
    .sort((a, b) => a.size - b.size || a.index - b.index);

  const result: Shape[] = shapes.map(() => []);
  const placed: typeof order = [];
  for (const item of order) {
    const covering = placed
      .filter((other) => boundsOverlap(item.bounds, other.bounds))
      .map((other) => other.shape);
    result[item.index] = covering.length > 0 ? subtract(item.shape, covering) : item.shape;
    placed.push(item);
  }
  return result;
}

/* ---------------------------- Schildposition ----------------------------- */

export interface LabelPoint {
  point: LatLng;
  /** Abstand zum naechsten Rand in Metern - so viel Platz hat das Schild. */
  room: number;
}

/**
 * Der Punkt im Inneren, der am weitesten vom Rand entfernt ist ("Pol der
 * Unzugaenglichkeit", Verfahren von Mapbox/polylabel). Anders als die Mitte
 * der Ausdehnung liegt er garantiert in der Flaeche - auch bei L-Formen,
 * Loechern und schmalen Baendern.
 */
export function labelPoint(shape: Shape, precisionMeters = 2): LabelPoint | null {
  let best: LabelPoint | null = null;
  for (const polygon of shape) {
    const found = polylabel(polygon, precisionMeters);
    if (found && (!best || found.room > best.room)) best = found;
  }
  return best;
}

interface Cell {
  x: number;
  y: number;
  half: number;
  distance: number;
  potential: number;
}

function polylabel(polygon: Polygon, precision: number): LabelPoint | null {
  const outer = polygon[0];
  if (!outer || outer.length < 3) return null;

  // Ebene Naeherung in Metern um die Flaeche herum.
  const lat0 = outer[0][0];
  const mx = METERS_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
  const my = METERS_PER_DEGREE;
  const rings = polygon.map((ring) => ring.map(([lat, lng]) => [lng * mx, lat * my] as [number, number]));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of rings[0]) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const size = Math.min(width, height);
  const back = (x: number, y: number): LatLng => [round6(y / my), round6(x / mx)];
  if (size <= 0) return { point: back(minX, minY), room: 0 };

  const cell = (x: number, y: number, half: number): Cell => {
    const distance = signedDistance(x, y, rings);
    return { x, y, half, distance, potential: distance + half * Math.SQRT2 };
  };

  const queue = new MaxHeap<Cell>((cellItem) => cellItem.potential);
  const half = size / 2;
  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size) queue.push(cell(x + half, y + half, half));
  }

  let best = centroidCell(rings[0], cell) ?? cell(minX + width / 2, minY + height / 2, 0);
  const middle = cell(minX + width / 2, minY + height / 2, 0);
  if (middle.distance > best.distance) best = middle;

  // Obergrenze gegen entartete Eingaben - reicht fuer Meter-Genauigkeit locker.
  let budget = 20_000;
  while (queue.size > 0 && budget > 0) {
    budget -= 1;
    const current = queue.pop()!;
    if (current.distance > best.distance) best = current;
    if (current.potential - best.distance <= precision) continue;
    const h = current.half / 2;
    queue.push(cell(current.x - h, current.y - h, h));
    queue.push(cell(current.x + h, current.y - h, h));
    queue.push(cell(current.x - h, current.y + h, h));
    queue.push(cell(current.x + h, current.y + h, h));
  }

  return { point: back(best.x, best.y), room: Math.max(0, best.distance) };
}

function centroidCell(
  ring: Array<[number, number]>,
  cell: (x: number, y: number, half: number) => Cell,
): Cell | null {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[j];
    const f = ax * by - bx * ay;
    x += (ax + bx) * f;
    y += (ay + by) * f;
    area += f * 3;
  }
  if (area === 0) return null;
  return cell(x / area, y / area, 0);
}

/** Abstand zum naechsten Rand; positiv innen, negativ aussen. */
function signedDistance(x: number, y: number, rings: Array<Array<[number, number]>>): number {
  let inside = false;
  let minSq = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[j];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
      minSq = Math.min(minSq, segmentDistanceSq(x, y, ax, ay, bx, by));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(minSq);
}

function segmentDistanceSq(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  let x = ax;
  let y = ay;
  let dx = bx - x;
  let dy = by - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = bx;
      y = by;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

class MaxHeap<T> {
  private items: T[] = [];
  constructor(private score: (item: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.score(items[parent]) >= this.score(items[i])) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop(): T | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last !== undefined) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let largest = i;
        if (left < items.length && this.score(items[left]) > this.score(items[largest])) largest = left;
        if (right < items.length && this.score(items[right]) > this.score(items[largest])) largest = right;
        if (largest === i) break;
        [items[largest], items[i]] = [items[i], items[largest]];
        i = largest;
      }
    }
    return top;
  }
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
