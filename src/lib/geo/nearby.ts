/**
 * Was in der Naehe liegt - fuer die Tour.
 *
 * Alles auf dem Geraet und ohne Netz: Luftlinie (route.ts) vom eigenen
 * Standort zu den Tueren, die mit der Tour geladen sind. Nicht jede Adresse
 * hat in OpenStreetMap einen Punkt; eine Hausnummer ohne Lage steht deshalb
 * dort, wo ihr naechster Nachbar in der Strasse steht, sonst am Punkt der
 * Strasse. Solche Entfernungen sind geschaetzt und heissen "ca." - ebenso
 * jede, wenn der Standort selbst ungenau ist.
 */
import type { LatLng } from "./area";
import { distanceLabel, meters } from "./route";

/** Wo eine Tuer liegt - und ob das nur geschaetzt ist. */
export interface Spot {
  point: LatLng;
  approx: boolean;
}

export interface Distance {
  meters: number;
  /** Geschaetzt: die Tuer hat keinen eigenen Punkt. */
  approx: boolean;
}

export interface Nearest<T> {
  item: T;
  distance: Distance;
}

/** Ab dieser Ungenauigkeit des Standorts (m) heisst jede Entfernung "ca.". */
export const ROUGH_ACCURACY = 50;
/** Ungenauer (m) taugt ein Standort nicht fuer "in der Naehe" - etwa die Ortung ueber die IP am Rechner. */
export const USABLE_ACCURACY = 1000;
/** Darunter (m) steht man praktisch vor der Tuer. */
export const AT_DOOR = 15;
/** Ab hier (m) ist die gewaehlte Tuer "weit weg" - dann lohnt der Hinweis auf eine naehere. */
export const FAR_FROM_DOOR = 150;
/** Ungenauer (m) draengt sich kein Hinweis auf - er koennte schlicht falsch sein. */
export const SUGGEST_ACCURACY = 100;
/** So viel (m) naeher muss eine andere Tuer sein, bevor der Vorschlag wechselt. */
const STEADY_MARGIN = 20;

interface HouseLike {
  id: number;
  street_id: number;
  lat: number | null;
  lng: number | null;
}

interface StreetLike {
  id: number;
  lat: number | null;
  lng: number | null;
}

function pointOf(item: { lat: number | null; lng: number | null }): LatLng | null {
  return item.lat !== null && item.lng !== null && Number.isFinite(item.lat) && Number.isFinite(item.lng)
    ? [item.lat, item.lng]
    : null;
}

/**
 * Lage jeder Hausnummer. Die Hausnummern kommen je Strasse in ihrer
 * Reihenfolge (sort_order) - der Nachbar in der Liste ist meist auch der
 * Nachbar an der Strasse.
 */
export function placeHouses(houses: HouseLike[], streets: StreetLike[]): Map<number, Spot> {
  const streetPoints = new Map<number, LatLng>();
  for (const street of streets) {
    const point = pointOf(street);
    if (point) streetPoints.set(street.id, point);
  }

  const byStreet = new Map<number, HouseLike[]>();
  for (const house of houses) {
    const list = byStreet.get(house.street_id) ?? [];
    list.push(house);
    byStreet.set(house.street_id, list);
  }

  const spots = new Map<number, Spot>();
  for (const [streetId, list] of byStreet) {
    const own = list.map(pointOf);
    // Je Hausnummer der naechste Nachbar mit Lage - links und rechts in einem Durchgang.
    const left: number[] = [];
    let last = -1;
    own.forEach((point, index) => {
      if (point) last = index;
      left[index] = last;
    });
    const right: number[] = [];
    last = -1;
    for (let index = own.length - 1; index >= 0; index--) {
      if (own[index]) last = index;
      right[index] = last;
    }
    list.forEach((house, index) => {
      const point = own[index];
      if (point) {
        spots.set(house.id, { point, approx: false });
        return;
      }
      const l = left[index];
      const r = right[index];
      const neighbour = l < 0 ? r : r < 0 ? l : index - l <= r - index ? l : r;
      const fallback = neighbour >= 0 ? own[neighbour] : (streetPoints.get(streetId) ?? null);
      if (fallback) spots.set(house.id, { point: fallback, approx: true });
    });
  }
  return spots;
}

/**
 * Das naechste Element mit bekannter Lage. `prefer` haelt den bisherigen
 * Vorschlag, bis ein anderer deutlich naeher ist - sonst springt die Anzeige
 * im Gehen zwischen zwei fast gleich weiten Tueren hin und her.
 */
export function nearest<T>(
  from: LatLng,
  items: Iterable<T>,
  spotOf: (item: T) => Spot | null | undefined,
  prefer?: (item: T) => boolean,
): Nearest<T> | null {
  let best: Nearest<T> | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    const spot = spotOf(item);
    if (!spot) continue;
    const distance = meters(from, spot.point);
    const score = prefer?.(item) ? distance - STEADY_MARGIN : distance;
    if (score < bestScore) {
      bestScore = score;
      best = { item, distance: { meters: distance, approx: spot.approx } };
    }
  }
  return best;
}

/**
 * Entfernung zu jeder Strasse: bis zur naechsten offenen Tuer - dorthin
 * geht es ja -, ist alles erledigt bis zur naechsten Tuer, ohne
 * Hausnummern bis zum Punkt der Strasse (geschaetzt: eine Strasse ist lang).
 */
export function streetDistances<H extends HouseLike>(
  from: LatLng,
  streets: StreetLike[],
  houses: H[],
  spots: Map<number, Spot>,
  isOpen: (house: H) => boolean,
): Map<number, Distance> {
  const open = new Map<number, Distance>();
  const any = new Map<number, Distance>();
  const closer = (map: Map<number, Distance>, id: number, distance: Distance) => {
    const known = map.get(id);
    if (!known || distance.meters < known.meters) map.set(id, distance);
  };
  for (const house of houses) {
    const spot = spots.get(house.id);
    if (!spot) continue;
    const distance = { meters: meters(from, spot.point), approx: spot.approx };
    closer(any, house.street_id, distance);
    if (isOpen(house)) closer(open, house.street_id, distance);
  }

  const result = new Map<number, Distance>();
  for (const street of streets) {
    const known = open.get(street.id) ?? any.get(street.id);
    if (known) {
      result.set(street.id, known);
      continue;
    }
    const point = pointOf(street);
    if (point) result.set(street.id, { meters: meters(from, point), approx: true });
  }
  return result;
}

/** Entfernung zu jedem Gebiet: bis zu seiner naechsten Strasse. */
export function territoryDistances(
  streets: Array<{ id: number; territory_id: number }>,
  distances: Map<number, Distance>,
): Map<number, Distance> {
  const result = new Map<number, Distance>();
  for (const street of streets) {
    const distance = distances.get(street.id);
    if (!distance) continue;
    const known = result.get(street.territory_id);
    if (!known || distance.meters < known.meters) result.set(street.territory_id, distance);
  }
  return result;
}

/**
 * Nach Entfernung ordnen: Erledigtes nach hinten, Unbekanntes ans Ende
 * seiner Gruppe, bei Gleichstand die bisherige Reihenfolge.
 */
export function byDistance<T>(
  items: T[],
  distanceOf: (item: T) => number | undefined,
  finished: (item: T) => boolean = () => false,
): T[] {
  return items
    .map((item, index) => ({ item, index, done: finished(item), distance: distanceOf(item) ?? Infinity }))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.distance - b.distance || a.index - b.index)
    .map((entry) => entry.item);
}

/**
 * Lohnt der Hinweis auf eine andere Tuer? Nur, wenn die gewaehlte deutlich
 * weiter weg ist. Beim Gang die Strasse hinauf liegt die naechste offene
 * Tuer oft gegenueber - das soll nicht bei jedem Schritt aufblinken.
 */
export function worthSuggesting(current: Distance, suggestion: Distance, accuracy: number): boolean {
  if (accuracy > SUGGEST_ACCURACY) return false;
  return current.meters >= FAR_FROM_DOOR && suggestion.meters <= current.meters / 2;
}

/** "hier", "80 m", "ca. 120 m", "2,4 km" - ehrlich, so genau der Standort ist. */
export function distanceText(distance: Distance, accuracy = 0): string {
  const rough = distance.approx || accuracy > ROUGH_ACCURACY;
  if (distance.meters < AT_DOOR && !rough) return "hier";
  return `${rough ? "ca. " : ""}${distanceLabel(Math.max(distance.meters, 10))}`;
}
