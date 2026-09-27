/**
 * Laufroute durch die offenen Tueren eines Gebiets.
 *
 * Kein Strassenrouting, sondern eine gute Reihenfolge: erst immer zur
 * naechsten Tuer (Nearest Neighbour), danach werden Ueberkreuzungen
 * aufgeloest (2-opt). Weil Haeuser an Strassen liegen, folgt die Route damit
 * praktisch von selbst den Strassen - ohne Routing-Server und ohne Netz.
 */
import { METERS_PER_DEGREE, type LatLng } from "./area";

/** Gehtempo an der Tuer: 4,5 km/h. */
const WALK_M_PER_MIN = 75;
/** Pro Tuer: klingeln, warten, kurz sprechen - im Schnitt. */
const MIN_PER_DOOR = 1.5;
/** Bis zu dieser Zahl an Tueren wird die Reihenfolge nachpoliert. */
const TWO_OPT_LIMIT = 400;

export interface Stop {
  lat: number;
  lng: number;
}

/** Luftlinie in Metern - auf Gebietsgroesse genau genug. */
export function meters(a: LatLng, b: LatLng): number {
  const dLat = (b[0] - a[0]) * METERS_PER_DEGREE;
  const dLng = (b[1] - a[1]) * METERS_PER_DEGREE * Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

export interface PlannedRoute<T extends Stop> {
  stops: T[];
  /** Laufweg in Metern, ab dem Start */
  meters: number;
  /** Geschaetzte Dauer in Minuten, Gespraeche eingerechnet */
  minutes: number;
}

/**
 * Plant die Reihenfolge. Ohne Startpunkt beginnt die Route am Rand des
 * Gebiets (an der Tuer, die am weitesten von der Mitte entfernt ist) - so
 * laeuft man nicht erst in die Mitte und dann wieder hinaus.
 */
export function planRoute<T extends Stop>(items: T[], start: LatLng | null): PlannedRoute<T> {
  if (items.length === 0) return { stops: [], meters: 0, minutes: 0 };

  const points = items.map((item) => [item.lat, item.lng] as LatLng);
  let origin = start;
  if (!origin) {
    const middle: LatLng = [
      points.reduce((sum, p) => sum + p[0], 0) / points.length,
      points.reduce((sum, p) => sum + p[1], 0) / points.length,
    ];
    let far = 0;
    points.forEach((p, i) => {
      if (meters(p, middle) > meters(points[far], middle)) far = i;
    });
    origin = points[far];
  }

  // 1. Immer zur naechsten noch offenen Tuer.
  const left = new Set(points.map((_, i) => i));
  const order: number[] = [];
  let here = origin;
  while (left.size > 0) {
    let best = -1;
    let bestDistance = Infinity;
    for (const i of left) {
      const d = meters(here, points[i]);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    order.push(best);
    left.delete(best);
    here = points[best];
  }

  // 2. Ueberkreuzungen aufloesen: Teilstuecke umdrehen, solange es kuerzer wird.
  if (order.length > 3 && order.length <= TWO_OPT_LIMIT) {
    const at = (k: number) => (k < 0 ? origin! : points[order[k]]);
    let improved = true;
    let rounds = 0;
    while (improved && rounds < 8) {
      improved = false;
      rounds++;
      for (let i = 0; i < order.length - 2; i++) {
        for (let j = i + 1; j < order.length - 1; j++) {
          const before = meters(at(i - 1), at(i)) + meters(at(j), at(j + 1));
          const after = meters(at(i - 1), at(j)) + meters(at(i), at(j + 1));
          if (after + 0.5 < before) {
            order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
            improved = true;
          }
        }
      }
    }
  }

  let total = 0;
  let previous = origin;
  for (const i of order) {
    total += meters(previous, points[i]);
    previous = points[i];
  }

  return {
    stops: order.map((i) => items[i]),
    meters: Math.round(total),
    minutes: Math.round(total / WALK_M_PER_MIN + order.length * MIN_PER_DOOR),
  };
}

/** "850 m", "2,4 km" */
export function distanceLabel(value: number): string {
  if (value < 1000) return `${Math.round(value / 10) * 10} m`;
  return `${(value / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`;
}

/** "45 Min.", "2 Std. 10 Min." */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} Min.`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round((minutes - hours * 60) / 5) * 5;
  return rest ? `${hours} Std. ${rest} Min.` : `${hours} Std.`;
}
