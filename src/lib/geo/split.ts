/**
 * Ein grosses Gebiet auf mehrere Leute aufteilen.
 *
 * Drei Anforderungen:
 *  - jedes Haus gehoert zu genau dem Teilgebiet, in dessen Flaeche es liegt
 *  - jeder bekommt ungefaehr seinen Anteil an Tueren (gleich viel oder z. B. 60/40)
 *  - niemand soll quer durchs Viertel laufen, Strassen bleiben moeglichst ganz
 *
 * Frueher wurden ganze Strassen verteilt und die Flaechen danach um die
 * Haeuser gelegt. Eine lange Strasse quer durchs Viertel landete so komplett
 * in einem Teilgebiet, obwohl dessen Flaeche nur ihre halbe Laenge abdeckte -
 * ab drei Teilen passten die nachtraeglich gerechneten Grenzen oft gar nicht
 * mehr. Jetzt werden Haeuser verteilt, und Flaeche und Haeuser kommen aus
 * derselben Rechnung:
 *
 * Kapazitaetsbeschraenktes Potenzdiagramm. Jedes Teilgebiet hat eine Mitte c
 * und ein Gewicht psi; ein Punkt x gehoert zu dem Teilgebiet mit dem kleinsten
 * |x - c|² - psi. Die Zellen sind Vielecke mit geraden Grenzen, luecken- und
 * ueberschneidungsfrei - und ein Haus liegt genau dann in einer Zelle, wenn es
 * zu ihr gehoert. Die Gewichte werden so eingestellt, dass jede Zelle ihren
 * Anteil an Tueren enthaelt; innerhalb der Toleranz waehlt jede Grenze die
 * Lage, die die wenigsten Strassen zerschneidet. Laeuft eine Strasse doch
 * ueber eine Grenze, wird sie dort geteilt ("Hauptstr. 1-39" / "41-80").
 *
 * Bewusst ohne Zufall: gleiche Eingabe, gleiches Ergebnis - sonst sieht die
 * Vorschau anders aus als das, was gespeichert wird.
 */

import { METERS_PER_DEGREE } from "./area";
import { intersect, shapeContains, type Shape } from "./shape";

/**
 * Hoechstzahl der Teilgebiete. Die Grenze kommt von der Karte: mehr Flaechen
 * nebeneinander sind farblich nicht mehr sicher zu unterscheiden - die Zahl
 * im Kreis bleibt ohnehin die eigentliche Kennzeichnung.
 */
export const MAX_PLOTS = 6;

/** Wie gross ein Teilgebiet im Vergleich zu den anderen wird (1 = normal). */
export const PLOT_SIZES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Bis zu 5 % Abweichung vom Soll je Teilgebiet sind in Ordnung. */
const TOLERANCE = 0.05;
const KMEANS_ROUNDS = 12;
/** Mitten nachziehen, solange sie sich noch bewegen - in der Praxis selten mehr als vier Runden. */
const LLOYD_ROUNDS = 6;
const BALANCE_ROUNDS = 40;
const COHESION_ROUNDS = 8;

export interface SplitHouse {
  number: string;
  units: number;
  lat: number | null;
  lng: number | null;
}

/** Was eine Strasse zum Aufteilen mitbringen muss - FoundStreet und StreetInput passen beide. */
export interface SplitStreet {
  name: string;
  houseNumbers: string;
  units: number;
  lat: number | null;
  lng: number | null;
  numbers?: SplitHouse[];
}

export interface PlotSplit<S> {
  /** Strassen dieses Teilgebiets - geteilte Strassen nur mit ihren Haeusern hier. */
  streets: S[];
  /** Flaeche, in der genau diese Haeuser liegen. */
  area: Shape;
  /** Arbeitsaufwand: Wohneinheiten, sonst Haeuser. */
  doors: number;
}

/** Aufwand einer Strasse: Wohneinheiten, sonst Zahl der Haeuser, mindestens eins. */
export function streetDoors(street: SplitStreet): number {
  if (street.units > 0) return street.units;
  return Math.max(1, street.numbers?.length ?? 0);
}

function houseDoors(house: SplitHouse): number {
  return Math.max(1, house.units);
}

/** Anteile wie [1, 1.5] auf eine Summe von 1 bringen; Unsinn zaehlt als 1. */
export function normalizeShares(sizes: number[]): number[] {
  const clean = sizes.map((size) => (Number.isFinite(size) && size > 0 ? Math.min(size, 10) : 1));
  const total = clean.reduce((sum, size) => sum + size, 0);
  return clean.map((size) => size / total);
}

/**
 * Teilt Flaeche und Strassen auf `sizes.length` Teilgebiete auf.
 * `sizes` sind die relativen Groessen (z. B. [1, 1, 1] oder [1.5, 1]).
 * Das Ergebnis hat immer genau so viele Eintraege (notfalls leere).
 */
export function splitIntoPlots<S extends SplitStreet>(area: Shape, streets: S[], sizes: number[]): PlotSplit<S>[] {
  const count = Math.max(1, Math.min(MAX_PLOTS, sizes.length));
  if (count === 1 || streets.length === 0) {
    const all: PlotSplit<S>[] = Array.from({ length: count }, () => ({ streets: [], area: [], doors: 0 }));
    all[0] = { streets: [...streets], area, doors: streets.reduce((sum, s) => sum + streetDoors(s), 0) };
    return all;
  }

  const projection = projectionFor(area, streets);
  const sites = sitesOf(streets, projection);
  const shares = normalizeShares(sizes.slice(0, count));
  const { assign, centers, psi } = partition(sites, shares);

  // Weniger Mitten als Teilgebiete (kaum Haeuser): die uebrigen bleiben ohne Flaeche.
  const cells = area.length > 0 && centers.length > 0 ? powerCells(area, sites, centers, psi, projection) : [];
  const areas: Shape[] = Array.from({ length: count }, (_, index) => cells[index] ?? []);

  // Wohin Strassen ganz ohne Lage gehen: zum Teilgebiet, das am weitesten unter seinem Soll liegt.
  const total = sites.reduce((sum, site) => sum + site.w, 0) + unplacedDoors(streets);
  const loads = new Array(count).fill(0) as number[];
  sites.forEach((site, index) => (loads[assign[index]] += site.w));
  const lightest = (doors: number) => {
    let best = 0;
    for (let i = 1; i < count; i += 1) {
      if (shares[i] * total - loads[i] > shares[best] * total - loads[best]) best = i;
    }
    loads[best] += doors;
    return best;
  };

  const siteIndex = new Map<string, number>();
  sites.forEach((site, index) => {
    for (const key of site.keys) siteIndex.set(key, index);
  });
  const groups = distribute(areas, streets, (streetIndex, houseIndex) => {
    const site = siteIndex.get(`${streetIndex}:${houseIndex}`);
    if (site !== undefined) return assign[site];
    return lightest(streetDoors(streets[streetIndex]));
  });

  return groups.map((group, index) => ({
    streets: group.sort((a, b) => a.name.localeCompare(b.name, "de-DE") || compareRange(a, b)),
    area: areas[index] ?? [],
    doors: group.reduce((sum, s) => sum + streetDoors(s), 0),
  }));
}

/**
 * Verteilt Strassen hausgenau auf Flaechen: Jedes Haus mit Lage kommt in die
 * Flaeche, in der es liegt. Das gilt fuer die Vorschau wie fuer den Server -
 * egal, wie die Strassen vorher verteilt waren.
 *
 *  - Haus ohne Lage: dorthin, wo die meisten Haeuser seiner Strasse liegen
 *  - Strasse ganz ohne Hauslage: nach ihrer Mitte, sonst `fallback`
 *  - Haus in keiner Flaeche (genau auf einer Grenze, ausserhalb): `fallback`
 *
 * `fallback(strasse, haus)` bekommt die Indizes (haus = -1 fuer die ganze
 * Strasse) und liefert die Nummer des Teilgebiets.
 */
export function distribute<S extends SplitStreet>(
  areas: Shape[],
  streets: S[],
  fallback: (streetIndex: number, houseIndex: number) => number,
): S[][] {
  const count = Math.max(1, areas.length);
  const clamp = (plot: number) => (Number.isInteger(plot) && plot >= 0 && plot < count ? plot : 0);
  const containing = (lat: number, lng: number) => areas.findIndex((shape) => shape.length > 0 && shapeContains(shape, [lat, lng]));
  const groups: S[][] = Array.from({ length: count }, () => []);

  streets.forEach((street, streetIndex) => {
    const numbers = street.numbers ?? [];
    const target = numbers.map((house, houseIndex) => {
      if (house.lat === null || house.lng === null) return -1;
      const inside = containing(house.lat, house.lng);
      return inside >= 0 ? inside : clamp(fallback(streetIndex, houseIndex));
    });

    let whole: number;
    if (target.some((plot) => plot >= 0)) {
      // Haeuser ohne Lage gehen mit der Mehrheit ihrer Strasse.
      const weight = new Array(count).fill(0) as number[];
      target.forEach((plot, houseIndex) => {
        if (plot >= 0) weight[plot] += houseDoors(numbers[houseIndex]);
      });
      whole = weight.indexOf(Math.max(...weight));
    } else if (street.lat !== null && street.lng !== null && containing(street.lat, street.lng) >= 0) {
      whole = containing(street.lat, street.lng);
    } else {
      whole = clamp(fallback(streetIndex, -1));
    }
    const final = target.map((plot) => (plot >= 0 ? plot : whole));

    if (numbers.length === 0 || final.every((plot) => plot === final[0])) {
      groups[numbers.length === 0 ? whole : final[0]].push(street);
      return;
    }
    for (let plot = 0; plot < count; plot += 1) {
      const part = numbers.filter((_, houseIndex) => final[houseIndex] === plot);
      if (part.length > 0) groups[plot].push(fragment(street, part));
    }
  });
  return groups;
}

/**
 * Fuer den Server: Teilgebiete, wie die App sie schickt, noch einmal nach
 * ihren Flaechen ordnen. Alle Strassen kommen auf einen Haufen (geteilte
 * Strassen wieder zusammen), dann geht jedes Haus in die Flaeche, in der es
 * liegt. So stimmt das Ergebnis auch, wenn eine alte App-Version (aus dem
 * Zwischenspeicher) noch ganze Strassen verteilt. Was in keiner Flaeche
 * liegt, bleibt, wo die App es hingelegt hat.
 */
export function regroupByArea<S extends SplitStreet>(groups: Array<{ area: Shape | null; streets: S[] }>): S[][] {
  interface Pooled {
    street: S;
    groups: Set<number>;
    /** Hausnummer (Schreibweise egal) -> Haus und Teilgebiet laut App. */
    houses: Map<string, { house: SplitHouse; group: number }>;
  }
  const pool = new Map<string, Pooled>();
  groups.forEach((group, index) => {
    for (const street of group.streets) {
      const key = street.name.trim().toLocaleLowerCase("de-DE");
      let entry = pool.get(key);
      if (!entry) {
        entry = { street, groups: new Set(), houses: new Map() };
        pool.set(key, entry);
      }
      entry.groups.add(index);
      for (const house of street.numbers ?? []) {
        const number = house.number.replace(/\s+/g, "").toLowerCase();
        if (!entry.houses.has(number)) entry.houses.set(number, { house, group: index });
      }
    }
  });

  const pooled = [...pool.values()];
  const streets = pooled.map((entry) => {
    // Aus einem Teilgebiet: unveraendert. Aus mehreren: wieder eine Strasse mit allen Haeusern.
    if (entry.groups.size <= 1) return entry.street;
    const numbers = [...entry.houses.values()].map((item) => item.house).sort(byHouseNumber);
    return fragment(entry.street, numbers);
  });
  const houseGroup = pooled.map((entry, streetIndex) => {
    const byNumber = new Map([...entry.houses.values()].map((item) => [item.house, item.group]));
    return (streets[streetIndex].numbers ?? []).map((house) => byNumber.get(house) ?? [...entry.groups][0]);
  });

  return distribute(
    groups.map((group) => group.area ?? []),
    streets,
    (streetIndex, houseIndex) =>
      houseIndex >= 0 ? houseGroup[streetIndex][houseIndex] : [...pooled[streetIndex].groups][0],
  );
}

/** Sortiert wie im Briefkasten: 2 vor 10, 12 vor 12a. */
function byHouseNumber(a: SplitHouse, b: SplitHouse): number {
  const parse = (value: string) => {
    const match = value.match(/^(\d+)\s*(.*)$/);
    return match ? { value: Number(match[1]), suffix: match[2] } : { value: 0, suffix: value };
  };
  const left = parse(a.number);
  const right = parse(b.number);
  return left.value - right.value || left.suffix.localeCompare(right.suffix, "de-DE");
}

/** Der Teil einer Strasse mit nur diesen Haeusern - Spanne, Einheiten und Mitte neu gerechnet. */
export function fragment<S extends SplitStreet>(street: S, numbers: SplitHouse[]): S {
  const located = numbers.filter((house) => house.lat !== null && house.lng !== null);
  const part: S = {
    ...street,
    numbers,
    houseNumbers: rangeOf(numbers),
    units: numbers.reduce((sum, house) => sum + houseDoors(house), 0),
    lat: located.length > 0 ? round6(located.reduce((sum, h) => sum + h.lat!, 0) / located.length) : street.lat,
    lng: located.length > 0 ? round6(located.reduce((sum, h) => sum + h.lng!, 0) / located.length) : street.lng,
  };
  // FoundStreet zaehlt zusaetzlich die Adressen.
  if ("addresses" in street) (part as S & { addresses: number }).addresses = numbers.length;
  return part;
}

/** "1-39" aus den Hausnummern in ihrer Reihenfolge. */
function rangeOf(numbers: SplitHouse[]): string {
  if (numbers.length === 0) return "";
  const first = numbers[0].number;
  const last = numbers[numbers.length - 1].number;
  return first === last ? first : `${first}-${last}`;
}

function compareRange(a: SplitStreet, b: SplitStreet): number {
  return (Number.parseInt(a.houseNumbers, 10) || 0) - (Number.parseInt(b.houseNumbers, 10) || 0);
}

function unplacedDoors(streets: SplitStreet[]): number {
  return streets.reduce((sum, street) => {
    const located = (street.numbers ?? []).some((h) => h.lat !== null && h.lng !== null);
    return located || (street.lat !== null && street.lng !== null) ? sum : sum + streetDoors(street);
  }, 0);
}

/* ------------------------------ Geometrie -------------------------------- */

type XY = [number, number];

interface Projection {
  toXY: (lat: number, lng: number) => XY;
  toLatLng: (point: XY) => [number, number];
}

/** Ebene Naeherung in Metern rund um die Flaeche - Gebiete sind nur wenige Kilometer gross. */
function projectionFor(area: Shape, streets: SplitStreet[]): Projection {
  let origin: [number, number] | null = area[0]?.[0]?.[0] ?? null;
  for (const street of streets) {
    if (origin) break;
    const house = street.numbers?.find((h) => h.lat !== null && h.lng !== null);
    if (house) origin = [house.lat!, house.lng!];
    else if (street.lat !== null && street.lng !== null) origin = [street.lat, street.lng];
  }
  const [lat0, lng0] = origin ?? [0, 0];
  const mx = METERS_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
  const my = METERS_PER_DEGREE;
  return {
    toXY: (lat, lng) => [(lng - lng0) * mx, (lat - lat0) * my],
    toLatLng: ([x, y]) => [round6(lat0 + y / my), round6(lng0 + x / mx)],
  };
}

/** Ein Punkt der Rechnung: ein Haus (mehrere Nummern am selben Fleck zusammengefasst) oder eine Strassenmitte. */
interface Site {
  x: number;
  y: number;
  w: number;
  street: number;
  /** "strasse:haus" aller Eingaben an diesem Punkt (haus = -1: die Strasse selbst). */
  keys: string[];
}

function sitesOf(streets: SplitStreet[], projection: Projection): Site[] {
  const sites: Site[] = [];
  const byPlace = new Map<string, Site>();
  const add = (streetIndex: number, houseIndex: number, lat: number, lng: number, w: number) => {
    // "12-16" an einem Gebaeude ergibt drei Nummern am selben Fleck - die bleiben beisammen.
    const place = `${streetIndex}|${lat}|${lng}`;
    const known = byPlace.get(place);
    if (known) {
      known.w += w;
      known.keys.push(`${streetIndex}:${houseIndex}`);
      return;
    }
    const [x, y] = projection.toXY(lat, lng);
    const site: Site = { x, y, w, street: streetIndex, keys: [`${streetIndex}:${houseIndex}`] };
    byPlace.set(place, site);
    sites.push(site);
  };

  streets.forEach((street, streetIndex) => {
    const numbers = street.numbers ?? [];
    let located = 0;
    numbers.forEach((house, houseIndex) => {
      if (house.lat === null || house.lng === null) return;
      located += 1;
      add(streetIndex, houseIndex, house.lat, house.lng, houseDoors(house));
    });
    if (located === 0 && street.lat !== null && street.lng !== null) {
      add(streetIndex, -1, street.lat, street.lng, streetDoors(street));
    }
  });
  return sites;
}

/**
 * Die eigentliche Aufteilung: Mitten nach k-Means, dann abwechselnd Gewichte
 * auf die Anteile einstellen und Mitten in den Schwerpunkt ihrer Zelle ziehen.
 * Zum Schluss legt jede Grenze sich - innerhalb der Toleranz - dorthin, wo sie
 * die wenigsten Strassen zerschneidet.
 */
function partition(sites: Site[], shares: number[]): { assign: number[]; centers: XY[]; psi: number[] } {
  const count = shares.length;
  if (sites.length <= count) {
    // Hoechstens ein Punkt je Teilgebiet - jeder bekommt seinen eigenen, der Rest bleibt leer.
    const centers = sites.map((site) => [site.x, site.y] as XY);
    return { assign: sites.map((_, index) => index), centers, psi: new Array(centers.length).fill(0) };
  }

  const total = sites.reduce((sum, site) => sum + site.w, 0);
  const targets = shares.map((share) => share * total);
  let centers = initialCenters(sites, count);
  let psi = new Array(count).fill(0) as number[];

  for (let round = 0; round < LLOYD_ROUNDS; round += 1) {
    psi = balance(sites, centers, psi, targets, false);
    const assign = assignAll(sites, centers, psi);
    const next = weightedCentroids(sites, assign, centers);
    const moved = Math.max(...next.map((c, i) => Math.hypot(c[0] - centers[i][0], c[1] - centers[i][1])));
    centers = next;
    if (moved < 1) break;
  }
  psi = balance(sites, centers, psi, targets, false);
  psi = balance(sites, centers, psi, targets, true);
  return { assign: assignAll(sites, centers, psi), centers, psi };
}

/** Startmitten: moeglichst weit auseinander, dann ein paar Runden k-Means - in Lesereihenfolge nummeriert. */
function initialCenters(sites: Site[], count: number): XY[] {
  const points = sites.map((site) => [site.x, site.y] as XY);
  const centers: XY[] = [points[0]];
  while (centers.length < count) {
    let best = points[0];
    let bestDistance = -1;
    for (const point of points) {
      const distance = Math.min(...centers.map((c) => squared(point, c)));
      if (distance > bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
    centers.push(best);
  }

  let current = centers;
  let assign = sites.map((site) => nearest([site.x, site.y], current));
  for (let round = 0; round < KMEANS_ROUNDS; round += 1) {
    current = weightedCentroids(sites, assign, current);
    const next = sites.map((site) => nearest([site.x, site.y], current));
    if (next.every((value, index) => value === assign[index])) break;
    assign = next;
  }
  // Nummer 1 oben links: von Nord nach Sued, bei gleicher Hoehe von West nach Ost.
  return [...current].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

function weightedCentroids(sites: Site[], assign: number[], previous: XY[]): XY[] {
  const sums = previous.map(() => [0, 0, 0]);
  sites.forEach((site, index) => {
    const group = sums[assign[index]];
    group[0] += site.x * site.w;
    group[1] += site.y * site.w;
    group[2] += site.w;
  });
  return sums.map((group, index) => (group[2] === 0 ? previous[index] : ([group[0] / group[2], group[1] / group[2]] as XY)));
}

function nearest(point: XY, centers: XY[]): number {
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

/** Zugehoerigkeit im Potenzdiagramm: kleinstes |x - c|² - psi, bei Gleichstand die kleinere Nummer. */
function owner(site: Site, centers: XY[], psi: number[], skip = -1): number {
  let best = -1;
  let bestValue = Infinity;
  for (let i = 0; i < centers.length; i += 1) {
    if (i === skip) continue;
    const value = (site.x - centers[i][0]) ** 2 + (site.y - centers[i][1]) ** 2 - psi[i];
    if (value < bestValue) {
      bestValue = value;
      best = i;
    }
  }
  return best;
}

function assignAll(sites: Site[], centers: XY[], psi: number[]): number[] {
  return sites.map((site) => owner(site, centers, psi));
}

/**
 * Stellt die Gewichte so ein, dass jede Zelle ihren Anteil enthaelt - Zelle
 * fuer Zelle, jeweils mit allen anderen fest. Fuer eine Zelle ist das exakt
 * loesbar: Jeder Punkt wechselt ab einem bestimmten Gewicht zu ihr, also
 * genuegt es, die Punkte nach dieser Schwelle zu sortieren.
 *
 * `cohesion`: unter allen Lagen innerhalb der Toleranz die, die am wenigsten
 * Strassen zerschneidet.
 */
function balance(sites: Site[], centers: XY[], start: number[], targets: number[], cohesion: boolean): number[] {
  const psi = [...start];
  const count = centers.length;
  const rounds = cohesion ? COHESION_ROUNDS : BALANCE_ROUNDS;
  const streetCount = sites.reduce((max, site) => Math.max(max, site.street + 1), 0);

  for (let round = 0; round < rounds; round += 1) {
    if (!cohesion) {
      const loads = new Array(count).fill(0) as number[];
      for (const site of sites) loads[owner(site, centers, psi)] += site.w;
      if (loads.every((load, i) => Math.abs(load - targets[i]) <= allowed(targets[i]))) break;
    }
    let changed = false;
    for (let i = 0; i < count; i += 1) {
      const next = bestWeight(i, sites, centers, psi, targets[i], cohesion ? streetCount : 0);
      if (next !== psi[i]) {
        psi[i] = next;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Hat die Rucksichtnahme auf Strassen die Anteile zu sehr verschoben, gilt wieder nur die Groesse.
  if (cohesion) {
    const loads = new Array(count).fill(0) as number[];
    for (const site of sites) loads[owner(site, centers, psi)] += site.w;
    if (loads.some((load, i) => Math.abs(load - targets[i]) > allowed(targets[i]) * 1.5)) {
      return balance(sites, centers, psi, targets, false);
    }
  }
  return psi;
}

function allowed(target: number): number {
  return Math.max(1, target * TOLERANCE);
}

/** Bestes Gewicht fuer Zelle i bei festen anderen Gewichten. */
function bestWeight(i: number, sites: Site[], centers: XY[], psi: number[], target: number, streetCount: number): number {
  const n = sites.length;
  const theta = new Float64Array(n);
  const other = new Int32Array(n);
  for (let j = 0; j < n; j += 1) {
    const site = sites[j];
    const rival = owner(site, centers, psi, i);
    other[j] = rival;
    const own = (site.x - centers[i][0]) ** 2 + (site.y - centers[i][1]) ** 2;
    const best = (site.x - centers[rival][0]) ** 2 + (site.y - centers[rival][1]) ** 2 - psi[rival];
    // Punkt j gehoert zu i, sobald psi_i >= theta_j.
    theta[j] = own - best;
  }
  const order = Array.from({ length: n }, (_, j) => j).sort((a, b) => theta[a] - theta[b]);

  // Strassen je Zelle zaehlen: zerschnitten ist eine Strasse mit Haeusern in mehr als einer Zelle.
  const k = centers.length;
  const perCell = streetCount > 0 ? new Int32Array(streetCount * k) : null;
  const cells = streetCount > 0 ? new Int32Array(streetCount) : null;
  let cut = 0;
  if (perCell && cells) {
    for (let j = 0; j < n; j += 1) {
      const slot = sites[j].street * k + other[j];
      if (perCell[slot]++ === 0 && ++cells[sites[j].street] === 2) cut += 1;
    }
  }

  const slack = allowed(target);
  let bestAt = 0;
  let bestError = Math.abs(target);
  let bestCut = cut;
  let bestGap = 0;
  let load = 0;
  const gapAt = (p: number) => (p === 0 || p === n ? 0 : theta[order[p]] - theta[order[p - 1]]);
  const better = (error: number, cuts: number, gap: number) => {
    if (!perCell) return error < bestError;
    const fits = error <= slack;
    const bestFits = bestError <= slack;
    if (fits !== bestFits) return fits;
    if (!fits) return error < bestError;
    return cuts < bestCut || (cuts === bestCut && (gap > bestGap * 1.5 || (gap >= bestGap / 1.5 && error < bestError)));
  };

  for (let p = 1; p <= n; p += 1) {
    const j = order[p - 1];
    load += sites[j].w;
    if (perCell && cells) {
      const street = sites[j].street;
      const from = street * k + other[j];
      const to = street * k + i;
      if (--perCell[from] === 0 && --cells[street] === 1) cut -= 1;
      if (perCell[to]++ === 0 && ++cells[street] === 2) cut += 1;
    }
    // Geschnitten wird nur zwischen zwei verschiedenen Schwellen - nie mitten durch einen Fleck.
    if (p < n && theta[order[p]] - theta[j] < 1e-6) continue;
    const error = Math.abs(load - target);
    const gap = gapAt(p);
    if (better(error, cut, gap)) {
      bestAt = p;
      bestError = error;
      bestCut = cut;
      bestGap = gap;
    }
  }

  if (bestAt === 0) return theta[order[0]] - 1;
  if (bestAt === n) return theta[order[n - 1]] + 1;
  // Grenze mittig in die Luecke - so liegt kein Haus knapp darauf.
  return (theta[order[bestAt - 1]] + theta[order[bestAt]]) / 2;
}

/**
 * Die Zellen als Flaechen: Rahmen um alles, je Nachbar eine Halbebene
 * abschneiden, auf die gezeichnete Flaeche zuschneiden.
 */
function powerCells(area: Shape, sites: Site[], centers: XY[], psi: number[], projection: Projection): Shape[] {
  const points: XY[] = [
    ...area.flatMap((polygon) => polygon[0] ?? []).map(([lat, lng]) => projection.toXY(lat, lng)),
    ...sites.map((site) => [site.x, site.y] as XY),
  ];
  const frame = frameOf(points, 200);
  return centers.map((ci, i) => {
    let cell = frame;
    for (let j = 0; j < centers.length && cell.length >= 3; j += 1) {
      if (j === i) continue;
      const cj = centers[j];
      // x gehoert zu i, solange |x-ci|² - psi_i <= |x-cj|² - psi_j.
      cell = clipHalfPlane(cell, 2 * (cj[0] - ci[0]), 2 * (cj[1] - ci[1]), norm2(cj) - norm2(ci) + psi[i] - psi[j]);
    }
    if (cell.length < 3) return [];
    return intersect(area, [[cell.map(projection.toLatLng)]]);
  });
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

function squared(a: XY, b: XY): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function norm2(p: XY): number {
  return p[0] * p[0] + p[1] * p[1];
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
