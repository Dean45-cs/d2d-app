import assert from "node:assert/strict";
import { test } from "node:test";
import { METERS_PER_DEGREE, type LatLng } from "../../src/lib/geo/area";
import {
  byDistance,
  distanceText,
  nearest,
  placeHouses,
  streetDistances,
  territoryDistances,
  worthSuggesting,
} from "../../src/lib/geo/nearby";

/*
 * "In meiner Nähe" an der Tuer: welche Tuer liegt wo, welche ist die
 * naechste offene, und wie ehrlich wird die Entfernung angezeigt.
 */

const BASE: LatLng = [54.3357, 10.1404];

/** Ein Punkt so viele Meter noerdlich und oestlich von BASE. */
function at(north: number, east = 0): LatLng {
  return [
    BASE[0] + north / METERS_PER_DEGREE,
    BASE[1] + east / (METERS_PER_DEGREE * Math.cos((BASE[0] * Math.PI) / 180)),
  ];
}

function house(id: number, streetId: number, point: LatLng | null) {
  return { id, street_id: streetId, lat: point?.[0] ?? null, lng: point?.[1] ?? null };
}

function street(id: number, point: LatLng | null, territoryId = 1) {
  return { id, territory_id: territoryId, lat: point?.[0] ?? null, lng: point?.[1] ?? null };
}

test("Hausnummern ohne Lage stehen beim naechsten Nachbarn der Strasse, sonst an der Strasse", () => {
  const houses = [
    house(1, 10, at(0)),
    house(2, 10, null), // Nachbar links (1) und rechts (4) gleich weit - links gewinnt
    house(3, 10, null), // rechts naeher (4)
    house(4, 10, at(30)),
    house(5, 10, null), // nur links (4)
    house(6, 20, null), // Strasse ohne Punkte: Strassenpunkt
    house(7, 30, null), // weder Haus- noch Strassenpunkt
  ];
  const spots = placeHouses(houses, [street(10, at(500)), street(20, at(1000)), street(30, null)]);

  assert.deepEqual(spots.get(1), { point: at(0), approx: false });
  assert.deepEqual(spots.get(2), { point: at(0), approx: true });
  assert.deepEqual(spots.get(3), { point: at(30), approx: true });
  assert.deepEqual(spots.get(5), { point: at(30), approx: true });
  assert.deepEqual(spots.get(6), { point: at(1000), approx: true });
  assert.equal(spots.has(7), false);
});

test("Nachbarn zaehlen nur in derselben Strasse", () => {
  const spots = placeHouses([house(1, 10, at(0)), house(2, 20, null)], [street(10, null), street(20, at(800))]);
  assert.deepEqual(spots.get(2), { point: at(800), approx: true });
});

test("nearest findet die naechste Tuer und ueberspringt Tueren ohne Lage", () => {
  const items = [
    { id: 1, point: at(120) },
    { id: 2, point: null },
    { id: 3, point: at(40, 30) },
    { id: 4, point: at(-200) },
  ];
  const found = nearest(BASE, items, (item) => (item.point ? { point: item.point, approx: false } : null));
  assert.equal(found?.item.id, 3);
  assert.ok(Math.abs(found!.distance.meters - 50) < 0.5);
  assert.equal(found!.distance.approx, false);

  assert.equal(nearest(BASE, [], () => null), null);
  assert.equal(nearest(BASE, items, () => null), null);
});

test("nearest bleibt beim bisherigen Vorschlag, bis ein anderer deutlich naeher ist", () => {
  const spot = (point: LatLng) => ({ point, approx: false });
  const items = [
    { id: 1, point: at(60) },
    { id: 2, point: at(-50) },
  ];
  // Ohne Vorgabe die naehere ...
  assert.equal(nearest(BASE, items, (item) => spot(item.point))?.item.id, 2);
  // ... mit Vorgabe bleibt die bisherige, 10 m Unterschied sind Rauschen im GPS.
  const kept = nearest(BASE, items, (item) => spot(item.point), (item) => item.id === 1);
  assert.equal(kept?.item.id, 1);
  // Die angezeigte Entfernung ist die echte, nicht die bevorzugte.
  assert.ok(Math.abs(kept!.distance.meters - 60) < 0.5);

  // Deutlich naeher (40 m) - dann wechselt der Vorschlag doch.
  const farther = [
    { id: 1, point: at(90) },
    { id: 2, point: at(-50) },
  ];
  assert.equal(nearest(BASE, farther, (item) => spot(item.point), (item) => item.id === 1)?.item.id, 2);
});

test("Entfernung je Strasse: bis zur naechsten offenen Tuer, sonst zur naechsten, sonst zur Strasse", () => {
  const houses = [
    { ...house(1, 10, at(20)), open: false },
    { ...house(2, 10, at(300)), open: true },
    { ...house(3, 20, at(150)), open: false },
    { ...house(4, 20, at(400)), open: false },
  ];
  const streets = [street(10, at(100)), street(20, at(200)), street(30, at(-700)), street(40, null)];
  const spots = placeHouses(houses, streets);
  const distances = streetDistances(BASE, streets, houses, spots, (h) => h.open);

  // Die erledigte Tuer 1 ist naeher - gegangen wird aber zur offenen.
  assert.ok(Math.abs(distances.get(10)!.meters - 300) < 0.5);
  assert.equal(distances.get(10)!.approx, false);
  // Alles erledigt: bis zur naechsten Tuer.
  assert.ok(Math.abs(distances.get(20)!.meters - 150) < 0.5);
  // Ohne Hausnummern: bis zum Punkt der Strasse - geschaetzt.
  assert.ok(Math.abs(distances.get(30)!.meters - 700) < 0.5);
  assert.equal(distances.get(30)!.approx, true);
  // Ganz ohne Lage: unbekannt.
  assert.equal(distances.has(40), false);
});

test("Entfernung je Gebiet: bis zu seiner naechsten Strasse", () => {
  const streets = [street(10, null, 1), street(20, null, 1), street(30, null, 2), street(40, null, 3)];
  const distances = new Map([
    [10, { meters: 900, approx: false }],
    [20, { meters: 250, approx: true }],
    [30, { meters: 2400, approx: false }],
  ]);
  const result = territoryDistances(streets, distances);
  assert.deepEqual(result.get(1), { meters: 250, approx: true });
  assert.deepEqual(result.get(2), { meters: 2400, approx: false });
  assert.equal(result.has(3), false);
});

test("byDistance: Naechstes zuerst, Erledigtes und Unbekanntes ans Ende, sonst stabil", () => {
  const items = [
    { name: "A", distance: 300, done: false },
    { name: "B", distance: undefined, done: false },
    { name: "C", distance: 100, done: true },
    { name: "D", distance: 200, done: false },
    { name: "E", distance: 200, done: false },
    { name: "F", distance: 50, done: false },
  ];
  const ordered = byDistance(
    items,
    (item) => item.distance,
    (item) => item.done,
  );
  assert.deepEqual(
    ordered.map((item) => item.name),
    ["F", "D", "E", "A", "B", "C"],
  );
  // Ohne Angabe zu "erledigt" zaehlt nur die Entfernung.
  assert.deepEqual(
    byDistance(items, (item) => item.distance).map((item) => item.name),
    ["F", "C", "D", "E", "A", "B"],
  );
});

test("Der Hinweis auf eine naehere Tuer kommt nur, wenn die gewaehlte weit weg ist", () => {
  const d = (meters: number) => ({ meters, approx: false });
  // Nach der Fahrt ins Gebiet: die eingestellte Tuer ist 1,2 km weg, eine offene 80 m.
  assert.equal(worthSuggesting(d(1200), d(80), 20), true);
  // Beim Gang die Strasse hinauf: gegenueber ist naeher, aber kein Grund zu draengeln.
  assert.equal(worthSuggesting(d(40), d(12), 10), false);
  // Weit weg, aber die andere kaum naeher.
  assert.equal(worthSuggesting(d(400), d(300), 10), false);
  // Standort zu grob - der Hinweis koennte schlicht falsch sein.
  assert.equal(worthSuggesting(d(1200), d(80), 250), false);
});

test("Entfernungen sind ehrlich: hier, gerundet, ca. bei Schaetzung oder grobem Standort", () => {
  assert.equal(distanceText({ meters: 8, approx: false }, 5), "hier");
  assert.equal(distanceText({ meters: 123, approx: false }, 10), "120 m");
  assert.equal(distanceText({ meters: 2437, approx: false }, 10), "2,4 km");
  // Geschaetzte Lage oder grober Standort: "ca.", nie "hier".
  assert.equal(distanceText({ meters: 8, approx: true }, 5), "ca. 10 m");
  assert.equal(distanceText({ meters: 123, approx: false }, 80), "ca. 120 m");
  assert.equal(distanceText({ meters: 123, approx: true }), "ca. 120 m");
});
