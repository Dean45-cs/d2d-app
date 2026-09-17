/**
 * Rechnen mit gezeichneten Gebietsflaechen.
 *
 * Eine Flaeche ist eine einfache Liste von Eckpunkten [Breitengrad, Laengengrad].
 * Bewusst ohne Geo-Bibliothek: Gebiete sind wenige Quadratkilometer gross, da
 * genuegt eine ebene Naeherung (1 Grad Breite = 111,32 km).
 */

export type LatLng = [number, number];

export const METERS_PER_DEGREE = 111_320;

/** Groesstes Gebiet, das sinnvoll an einem Stueck abgearbeitet wird. */
export const MAX_AREA_SQKM = 25;
export const MAX_POINTS = 80;

export function isLatLng(value: unknown): value is LatLng {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 90 &&
    Math.abs(value[1]) <= 180
  );
}

/** Liest eine Flaeche aus JSON/HTTP-Daten und wirft bei Unsinn. */
export function parseArea(value: unknown): LatLng[] {
  const raw = typeof value === "string" ? safeJson(value) : value;
  if (!Array.isArray(raw)) throw new Error("Bitte zuerst ein Gebiet auf der Karte markieren.");
  const points = raw.filter(isLatLng).map(([lat, lng]) => [round6(lat), round6(lng)] as LatLng);
  if (points.length !== raw.length) throw new Error("Die Gebietsfläche ist fehlerhaft.");
  if (points.length < 3) throw new Error("Ein Gebiet braucht mindestens drei Eckpunkte.");
  if (points.length > MAX_POINTS) {
    throw new Error(`Die Fläche hat zu viele Eckpunkte (max. ${MAX_POINTS}).`);
  }
  return points;
}

/** Wie parseArea, liefert aber null statt eines Fehlers (z. B. fuer gespeicherte Werte). */
export function readArea(value: unknown): LatLng[] | null {
  try {
    return value ? parseArea(value) : null;
  } catch {
    return null;
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Flaecheninhalt in Quadratkilometern (Gauss-Trapezformel auf ebener Naeherung). */
export function areaSqKm(points: LatLng[]): number {
  if (points.length < 3) return 0;
  const latRad = (points[0][0] * Math.PI) / 180;
  const mx = (METERS_PER_DEGREE * Math.cos(latRad)) / 1000; // km pro Grad Laenge
  const my = METERS_PER_DEGREE / 1000; // km pro Grad Breite
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [lat1, lng1] = points[i];
    const [lat2, lng2] = points[(i + 1) % points.length];
    sum += lng1 * mx * (lat2 * my) - lng2 * mx * (lat1 * my);
  }
  return Math.abs(sum) / 2;
}

/** Mittelpunkt der Flaeche (Schwerpunkt der Eckpunkte). */
export function centerOf(points: LatLng[]): LatLng {
  const lat = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const lng = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return [round6(lat), round6(lng)];
}

export function boundsOf(points: LatLng[]): { south: number; west: number; north: number; east: number } {
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  return {
    south: Math.min(...lats),
    west: Math.min(...lngs),
    north: Math.max(...lats),
    east: Math.max(...lngs),
  };
}

/** Naehert einen Umkreis durch ein Vieleck an - so wird aus einem Tipp ein Gebiet. */
export function circleToArea(center: LatLng, radiusMeters: number, steps = 24): LatLng[] {
  const [lat, lng] = center;
  const latRad = (lat * Math.PI) / 180;
  const dLat = radiusMeters / METERS_PER_DEGREE;
  const dLng = radiusMeters / (METERS_PER_DEGREE * Math.max(0.1, Math.cos(latRad)));
  const points: LatLng[] = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (2 * Math.PI * i) / steps;
    points.push([round6(lat + dLat * Math.cos(angle)), round6(lng + dLng * Math.sin(angle))]);
  }
  return points;
}

/** Punkt-in-Flaeche (Strahlenverfahren) - filtert Adressen ausserhalb der Zeichnung. */
export function contains(points: LatLng[], point: LatLng): boolean {
  const [lat, lng] = point;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [latI, lngI] = points[i];
    const [latJ, lngJ] = points[j];
    const crosses = latI > lat !== latJ > lat;
    if (crosses && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) {
      inside = !inside;
    }
  }
  return inside;
}

/** Overpass erwartet "lat lng lat lng ..." in einem poly-Filter. */
export function toOverpassPoly(points: LatLng[]): string {
  return points.map(([lat, lng]) => `${lat} ${lng}`).join(" ");
}
