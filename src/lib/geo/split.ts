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

import { METERS_PER_DEGREE, type LatLng } from "./area";
import { intersect, type Shape } from "./shape";

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

/* ------------------------- Flaechen der Pakete -------------------------- */

type XY = [number, number];

/**
 * Teilt die Flaeche lueckenlos und ohne Ueberschneidung auf die Pakete auf.
 *
 * Jedes Paket bekommt eine Zelle eines gewichteten Voronoi-Diagramms
 * (Potenzdiagramm) um die Mitte seiner Haeuser: gerade Grenzen, keine Luecken,
 * keine Ueberlappung. Die Gewichte schieben jede Grenze dorthin, wo sie die
 * Haeuser der beiden Nachbarpakete am besten trennt - bei ungleich grossen
 * Paketen liegt sie also nicht stumpf in der Mitte.
 *
 * `groups[i]` sind die Haeuser von Paket i; das Ergebnis hat dieselbe Laenge.
 */
export function plotAreas(area: Shape, groups: LatLng[][]): Shape[] {
  const used = groups
    .map((points, index) => ({ index, points }))
    .filter((group) => group.points.length > 0);
  const result: Shape[] = groups.map(() => []);
  if (area.length === 0 || used.length === 0) return result;
  if (used.length === 1) {
    result[used[0].index] = area;
    return result;
  }

  // Ebene Naeherung in Metern rund um die Flaeche.
  const [lat0, lng0] = area[0][0][0];
  const mx = METERS_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
  const my = METERS_PER_DEGREE;
  const toXY = ([lat, lng]: LatLng): XY => [(lng - lng0) * mx, (lat - lat0) * my];
  const toLatLng = ([x, y]: XY): LatLng => [round6(lat0 + y / my), round6(lng0 + x / mx)];

  const sets = used.map((group) => group.points.map(toXY));
  const centers = sets.map(mean);
  const weights = powerWeights(sets, centers);

  // Grosszuegiger Rahmen um die Flaeche - die Zellen werden danach auf sie zugeschnitten.
  const frame = frameOf(area.flatMap((polygon) => polygon[0] ?? []).map(toXY), 200);

  used.forEach((group, i) => {
    let cell = frame;
    for (let j = 0; j < used.length && cell.length >= 3; j += 1) {
      if (j === i) continue;
      const [ci, cj] = [centers[i], centers[j]];
      // Punkt x gehoert zu i, solange |x-ci|² - wi <= |x-cj|² - wj.
      cell = clipHalfPlane(
        cell,
        2 * (cj[0] - ci[0]),
        2 * (cj[1] - ci[1]),
        norm2(cj) - norm2(ci) + weights[i] - weights[j],
      );
    }
    if (cell.length < 3) return;
    result[group.index] = intersect(area, [[cell.map(toLatLng)]]);
  });
  return result;
}

/**
 * Gewichte des Potenzdiagramms. Fuer jedes Paar Nachbarpakete gibt es eine
 * beste Trennlinie; die Gewichte werden so gewaehlt, dass alle Grenzen diesen
 * Linien moeglichst nahe kommen (kleinste Quadrate, erstes Gewicht = 0).
 */
function powerWeights(sets: XY[][], centers: XY[]): number[] {
  const k = centers.length;
  const matrix = Array.from({ length: k }, () => new Array(k).fill(0) as number[]);
  const rhs = new Array(k).fill(0) as number[];

  // Wie stark ein Paar zaehlt: Haeuser, fuer die genau diese beiden Pakete die
  // naechsten sind. Pakete, die sich nicht beruehren, bestimmen so nichts.
  const pairWeight = Array.from({ length: k }, () => new Array(k).fill(0.01) as number[]);
  for (const point of sets.flat()) {
    const [first, second] = centers
      .map((center, index) => ({ index, distance: norm2([point[0] - center[0], point[1] - center[1]]) }))
      .sort((a, b) => a.distance - b.distance);
    pairWeight[first.index][second.index] += 1;
    pairWeight[second.index][first.index] += 1;
  }

  for (let i = 0; i < k; i += 1) {
    for (let j = i + 1; j < k; j += 1) {
      const d: XY = [centers[j][0] - centers[i][0], centers[j][1] - centers[i][1]];
      const length = Math.hypot(d[0], d[1]);
      if (length < 1e-6) continue;
      const u: XY = [d[0] / length, d[1] / length];
      const t = bestThreshold(
        sets[i].map((p) => p[0] * u[0] + p[1] * u[1]),
        sets[j].map((p) => p[0] * u[0] + p[1] * u[1]),
      );
      // Grenze bei x·u = t  <=>  wi - wj = 2·|d|·t - (|cj|² - |ci|²)
      const b = 2 * length * t - (norm2(centers[j]) - norm2(centers[i]));
      const w = pairWeight[i][j];
      matrix[i][i] += w;
      matrix[j][j] += w;
      matrix[i][j] -= w;
      matrix[j][i] -= w;
      rhs[i] += w * b;
      rhs[j] -= w * b;
    }
  }

  // Erstes Gewicht festhalten, den Rest loesen.
  const size = k - 1;
  const a = matrix.slice(1).map((row) => row.slice(1));
  const r = rhs.slice(1);
  const solved = solve(a, r) ?? new Array(size).fill(0);
  return [0, ...solved];
}

/**
 * Schwelle auf einer Achse, die Paket a (links) und b (rechts) am saubersten
 * trennt: moeglichst wenige Haeuser auf der falschen Seite, bei Gleichstand
 * mitten in der breitesten Luecke.
 */
function bestThreshold(a: number[], b: number[]): number {
  const values = [
    ...a.map((value) => ({ value, side: 0 })),
    ...b.map((value) => ({ value, side: 1 })),
  ].sort((x, y) => x.value - y.value);

  // Schwelle vor allen Werten: alle aus a liegen falsch.
  let wrong = a.length;
  let best = { wrong, gap: 0, at: values[0].value };
  for (let index = 0; index < values.length; index += 1) {
    wrong += values[index].side === 0 ? -1 : 1;
    const next = values[index + 1];
    if (next && next.value === values[index].value) continue;
    const gap = next ? next.value - values[index].value : 0;
    const at = next ? (values[index].value + next.value) / 2 : values[index].value;
    if (wrong < best.wrong || (wrong === best.wrong && gap > best.gap)) best = { wrong, gap, at };
  }
  return best.at;
}

/** Gauss-Elimination fuer die paar Gewichte (hoechstens drei Unbekannte). */
function solve(a: number[][], r: number[]): number[] | null {
  const n = r.length;
  const m = a.map((row, i) => [...row, r[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= n; k += 1) m[row][k] -= factor * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Schneidet ein konvexes Vieleck auf die Halbebene ax·x + ay·y <= c zu. */
function clipHalfPlane(polygon: XY[], ax: number, ay: number, c: number): XY[] {
  const out: XY[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const fp = ax * p[0] + ay * p[1] - c;
    const fq = ax * q[0] + ay * q[1] - c;
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

function frameOf(points: XY[], margin: number): XY[] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs) - margin, Math.max(...xs) + margin];
  const [y0, y1] = [Math.min(...ys) - margin, Math.max(...ys) + margin];
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

function mean(points: XY[]): XY {
  const x = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const y = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return [x, y];
}

function norm2(p: XY): number {
  return p[0] * p[0] + p[1] * p[1];
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
