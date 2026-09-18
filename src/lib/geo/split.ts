/**
 * Ein grosses Gebiet auf mehrere Leute aufteilen.
 *
 * Zwei Anforderungen, die sich widersprechen:
 *  - jeder soll ungefaehr gleich viele Tueren bekommen
 *  - niemand soll quer durchs Viertel laufen
 *
 * Deshalb erst raeumlich gruppieren (k-Means auf den Strassenmitten), danach
 * so lange die guenstigste Strasse vom vollsten zum leersten Paket schieben,
 * bis die Pakete ungefaehr gleich schwer sind. Bewusst ohne Zufall: gleiche
 * Eingabe, gleiches Ergebnis - sonst sieht die Vorschau anders aus als das,
 * was gespeichert wird.
 */

import { METERS_PER_DEGREE, circleToArea, type LatLng } from "./area";

export interface SplitStreet {
  name: string;
  lat: number | null;
  lng: number | null;
  /** Arbeitsaufwand der Strasse: Wohneinheiten, sonst Adressen. */
  weight: number;
}

/**
 * Hoechstzahl der Pakete. Die Grenze kommt von der Karte: mehr als vier
 * Flaechen nebeneinander sind farblich nicht mehr sicher zu unterscheiden
 * (geprueft auf Rot-Gruen-Schwaeche, hell und dunkel).
 */
export const MAX_PLOTS = 4;

const KMEANS_ROUNDS = 12;
const BALANCE_ROUNDS = 400;
/** Bis zu 12 % Unterschied zwischen groesstem und kleinstem Paket sind in Ordnung. */
const TOLERANCE = 0.12;

/**
 * Verteilt die Strassen auf `count` Pakete.
 * Das Ergebnis hat immer genau `count` Eintraege (notfalls leere).
 */
export function splitStreets<T extends SplitStreet>(streets: T[], count: number): T[][] {
  const groups: T[][] = Array.from({ length: Math.max(1, count) }, () => []);
  if (count <= 1 || streets.length === 0) {
    groups[0] = [...streets];
    return groups;
  }

  const located = streets.filter((s) => s.lat !== null && s.lng !== null);
  const unlocated = streets.filter((s) => s.lat === null || s.lng === null);

  if (located.length <= count) {
    // Zu wenig Koordinaten fuer eine sinnvolle Aufteilung: schlicht reihum.
    [...located, ...unlocated].forEach((street, index) => groups[index % count].push(street));
    return groups;
  }

  const scale = Math.cos((located[0].lat! * Math.PI) / 180);
  const xy = located.map((s) => [s.lng! * scale, s.lat!] as [number, number]);
  const weights = located.map((s) => Math.max(1, s.weight));

  let centers = seed(xy, count);
  let assignment = xy.map((point) => nearest(point, centers));

  for (let round = 0; round < KMEANS_ROUNDS; round += 1) {
    centers = centroids(xy, assignment, count, centers);
    const next = xy.map((point) => nearest(point, centers));
    if (next.every((value, index) => value === assignment[index])) break;
    assignment = next;
  }

  balance(xy, weights, assignment, centers, count);

  located.forEach((street, index) => groups[assignment[index]].push(street));
  // Strassen ohne Koordinate wandern in das jeweils leichteste Paket.
  for (const street of unlocated) {
    let lightest = 0;
    for (let i = 1; i < count; i += 1) {
      if (weightOf(groups[i]) < weightOf(groups[lightest])) lightest = i;
    }
    groups[lightest].push(street);
  }

  return groups.map((group) => group.sort((a, b) => a.name.localeCompare(b.name, "de-DE")));
}

function weightOf(group: SplitStreet[]): number {
  return group.reduce((sum, s) => sum + Math.max(1, s.weight), 0);
}

/** Startpunkte moeglichst weit auseinander - das vermeidet zerfledderte Pakete. */
function seed(xy: Array<[number, number]>, count: number): Array<[number, number]> {
  const centers: Array<[number, number]> = [xy[0]];
  while (centers.length < count) {
    let best = xy[0];
    let bestDistance = -1;
    for (const point of xy) {
      const distance = Math.min(...centers.map((c) => squared(point, c)));
      if (distance > bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
    centers.push(best);
  }
  return centers;
}

function centroids(
  xy: Array<[number, number]>,
  assignment: number[],
  count: number,
  previous: Array<[number, number]>,
): Array<[number, number]> {
  const sums = Array.from({ length: count }, () => [0, 0, 0]);
  xy.forEach((point, index) => {
    const group = sums[assignment[index]];
    group[0] += point[0];
    group[1] += point[1];
    group[2] += 1;
  });
  return sums.map((group, index) =>
    group[2] === 0
      ? previous[index]
      : ([group[0] / group[2], group[1] / group[2]] as [number, number]),
  );
}

function nearest(point: [number, number], centers: Array<[number, number]>): number {
  let best = 0;
  let bestDistance = Infinity;
  centers.forEach((center, index) => {
    const distance = squared(point, center);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

function squared(a: [number, number], b: [number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

/**
 * Gleicht die Paketgroessen an: immer die Strasse verschieben, die dem
 * leichteren Paket am naechsten liegt.
 *
 * Verschoben wird nur, wenn die Strasse leichter ist als der Abstand zwischen
 * vollstem und leerstem Paket. Dann wird der Unterschied garantiert kleiner -
 * die Pakete koennen sich also nicht gegenseitig hin und her schaukeln, und
 * das Verfahren kommt von selbst zum Stehen.
 */
function balance(
  xy: Array<[number, number]>,
  weights: number[],
  assignment: number[],
  centers: Array<[number, number]>,
  count: number,
): void {
  const total = weights.reduce((sum, w) => sum + w, 0);
  const allowed = Math.max(1, (total / count) * TOLERANCE);

  for (let round = 0; round < BALANCE_ROUNDS; round += 1) {
    const loads = new Array(count).fill(0) as number[];
    assignment.forEach((group, index) => (loads[group] += weights[index]));

    let heavy = 0;
    let light = 0;
    loads.forEach((load, index) => {
      if (load > loads[heavy]) heavy = index;
      if (load < loads[light]) light = index;
    });
    const gap = loads[heavy] - loads[light];
    if (gap <= allowed) return;

    let candidate = -1;
    let bestCost = Infinity;
    assignment.forEach((group, index) => {
      if (group !== heavy || weights[index] >= gap) return;
      const cost = squared(xy[index], centers[light]) - squared(xy[index], centers[heavy]);
      if (cost < bestCost) {
        bestCost = cost;
        candidate = index;
      }
    });

    // Nichts mehr zu holen: die Pakete sind so gleich, wie es die einzelnen
    // Strassen zulassen (eine Strasse mit 50 Wohneinheiten laesst sich nicht teilen).
    if (candidate === -1) return;
    assignment[candidate] = light;
  }
}

/* ------------------------- Umriss eines Pakets -------------------------- */

/**
 * Legt eine Flaeche um die Punkte eines Pakets: konvexe Huelle, danach ein
 * Stueck nach aussen geschoben, damit die Haeuser am Rand sicher drin liegen.
 */
export function outlineOf(points: LatLng[], bufferMeters = 60): LatLng[] {
  const unique = dedupe(points);
  if (unique.length === 0) return [];
  if (unique.length === 1) return circleToArea(unique[0], Math.max(bufferMeters, 120), 18);
  if (unique.length === 2) {
    const middle: LatLng = [
      (unique[0][0] + unique[1][0]) / 2,
      (unique[0][1] + unique[1][1]) / 2,
    ];
    const half = distanceMeters(unique[0], unique[1]) / 2;
    return circleToArea(middle, half + bufferMeters, 20);
  }

  const hull = convexHull(unique);
  if (hull.length < 3) {
    return circleToArea(hull[0] ?? unique[0], Math.max(bufferMeters, 120), 18);
  }

  const center: LatLng = [
    hull.reduce((sum, p) => sum + p[0], 0) / hull.length,
    hull.reduce((sum, p) => sum + p[1], 0) / hull.length,
  ];

  return hull.slice(0, 60).map(([lat, lng]) => {
    const dLat = lat - center[0];
    const dLng = lng - center[1];
    const length = Math.max(1e-9, Math.hypot(dLat, dLng * Math.cos((lat * Math.PI) / 180)));
    const grow = bufferMeters / METERS_PER_DEGREE;
    return [
      round6(lat + (dLat / length) * grow),
      round6(lng + (dLng / length) * grow),
    ] as LatLng;
  });
}

function dedupe(points: LatLng[]): LatLng[] {
  const seen = new Set<string>();
  const out: LatLng[] = [];
  for (const [lat, lng] of points) {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([lat, lng]);
  }
  return out;
}

/** Konvexe Huelle nach Andrew (untere und obere Kette). */
function convexHull(points: LatLng[]): LatLng[] {
  const sorted = [...points].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const build = (list: LatLng[]): LatLng[] => {
    const chain: LatLng[] = [];
    for (const point of list) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0) {
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  return [...build(sorted), ...build([...sorted].reverse())];
}

function cross(o: LatLng, a: LatLng, b: LatLng): number {
  return (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
}

function distanceMeters(a: LatLng, b: LatLng): number {
  const scale = Math.cos((a[0] * Math.PI) / 180);
  return (
    Math.hypot(a[0] - b[0], (a[1] - b[1]) * scale) * METERS_PER_DEGREE
  );
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
