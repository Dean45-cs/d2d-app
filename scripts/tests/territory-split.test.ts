import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth";
import { readShape, shapeToJson } from "../../src/lib/geo/area";
import { shapeContains, type Shape } from "../../src/lib/geo/shape";
import { regroupByArea, splitIntoPlots, type SplitStreet } from "../../src/lib/geo/split";
import { createTerritories, getTerritory, listStreets, topWorkers, type StreetInput } from "../../src/lib/queries";
import { combinedProgress, groupMembers, mergeTerritories, partTitle } from "../../src/lib/territory-groups";
import { reconcileTerritory } from "../../src/lib/territory-reconcile";
import type { User } from "../../src/lib/types";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-split-"));
const previous = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = path.join(directory, "test.db");
const db = getDb();
after(() => {
  db.close();
  global.__d2dDb = undefined;
  if (previous === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previous;
  rmSync(directory, { recursive: true, force: true });
});

/* ------------------------------ Testviertel ------------------------------ */

// Meter rund um einen Punkt in Koeln - die App rechnet genauso eben.
const LAT0 = 50.94;
const LNG0 = 6.95;
const at = (x: number, y: number): [number, number] => [
  Math.round((LAT0 + y / 111_320) * 1e6) / 1e6,
  Math.round((LNG0 + x / (111_320 * Math.cos((LAT0 * Math.PI) / 180))) * 1e6) / 1e6,
];
const square = (x0: number, y0: number, x1: number, y1: number): Shape => [[[at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]]];

function street(name: string, points: Array<[number, number]>, units = 1): StreetInput {
  const numbers = points.map(([x, y], index) => {
    const [lat, lng] = at(x, y);
    return { number: String(index + 1), units, lat, lng };
  });
  return {
    name,
    houseNumbers: `1-${numbers.length}`,
    units: numbers.length * units,
    lat: numbers[0]?.lat ?? null,
    lng: numbers[0]?.lng ?? null,
    numbers,
  };
}

/**
 * Ein Viertel wie das, an dem die alte Aufteilung scheiterte: kurze
 * Seitenstrassen und zwei lange Strassen quer durch alles.
 */
function quarter(): StreetInput[] {
  const streets: StreetInput[] = [];
  streets.push(street("Hauptstraße", Array.from({ length: 48 }, (_, i) => [20 + i * 20, 505] as [number, number])));
  streets.push(street("Ringstraße", Array.from({ length: 48 }, (_, i) => [505, 20 + i * 20] as [number, number])));
  for (let k = 0; k < 8; k += 1) {
    const x = 60 + k * 120;
    streets.push(street(`Weg ${k}`, Array.from({ length: 10 }, (_, i) => [x, 30 + i * 45] as [number, number])));
    streets.push(street(`Gasse ${k}`, Array.from({ length: 10 }, (_, i) => [x, 560 + i * 45] as [number, number]), 2));
  }
  return streets;
}

const AREA = square(0, 0, 1000, 1000);

/** Jedes Haus liegt in der Flaeche seines Teilgebiets - und in keiner anderen. */
function assertConsistent(plots: Array<{ streets: SplitStreet[]; area: Shape }>) {
  plots.forEach((plot, index) => {
    for (const s of plot.streets) {
      for (const house of s.numbers ?? []) {
        if (house.lat === null || house.lng === null) continue;
        const point: [number, number] = [house.lat, house.lng];
        assert.ok(shapeContains(plot.area, point), `${s.name} ${house.number} liegt nicht in Teilgebiet ${index + 1}`);
        plots.forEach((other, otherIndex) => {
          if (otherIndex !== index) assert.ok(!shapeContains(other.area, point), `${s.name} ${house.number} liegt auch in ${otherIndex + 1}`);
        });
      }
    }
  });
}

function houseKeys(plots: Array<{ streets: SplitStreet[] }>): string[] {
  return plots.flatMap((plot) => plot.streets.flatMap((s) => (s.numbers ?? []).map((h) => `${s.name}|${h.number}`)));
}

/* --------------------------- Aufteilen (rein) ---------------------------- */

test("every house of a split plot lies inside that plot's area, for 2 to 6 parts", () => {
  const streets = quarter();
  const all = houseKeys([{ streets }]).sort();
  for (let count = 2; count <= 6; count += 1) {
    const plots = splitIntoPlots(AREA, streets, new Array(count).fill(1));
    assert.equal(plots.length, count);
    assertConsistent(plots);
    // Kein Haus doppelt, keines verloren.
    assert.deepEqual(houseKeys(plots).sort(), all, `${count} Teile`);
    const total = plots.reduce((sum, plot) => sum + plot.doors, 0);
    for (const plot of plots) {
      assert.ok(Math.abs(plot.doors / total - 1 / count) < 0.06, `${count} Teile: ${plot.doors} von ${total}`);
    }
  }
});

test("a street running across a boundary is split at the boundary with fresh ranges", () => {
  const plots = splitIntoPlots(AREA, quarter(), [1, 1, 1]);
  const parts = plots.flatMap((plot) => plot.streets.filter((s) => s.name === "Hauptstraße"));
  assert.ok(parts.length >= 2, "die Hauptstraße läuft durch mehrere Teilgebiete");
  assert.equal(parts.reduce((sum, s) => sum + (s.numbers?.length ?? 0), 0), 48);
  for (const part of parts) {
    const numbers = part.numbers ?? [];
    assert.equal(part.houseNumbers, numbers.length === 1 ? numbers[0].number : `${numbers[0].number}-${numbers[numbers.length - 1].number}`);
    assert.equal(part.units, numbers.length);
  }
});

test("sizes give unequal shares - 1.5 to 1 is about 60/40", () => {
  const plots = splitIntoPlots(AREA, quarter(), [1.5, 1]);
  const total = plots[0].doors + plots[1].doors;
  assert.ok(Math.abs(plots[0].doors / total - 0.6) < 0.05, `${plots[0].doors} von ${total}`);
  assertConsistent(plots);
  const triple = splitIntoPlots(AREA, quarter(), [2, 1, 1]);
  const sum = triple.reduce((acc, plot) => acc + plot.doors, 0);
  assert.ok(Math.abs(triple[0].doors / sum - 0.5) < 0.05);
});

test("the split is deterministic - the preview is what gets saved", () => {
  const first = splitIntoPlots(AREA, quarter(), [1, 1, 1, 1]);
  const second = splitIntoPlots(AREA, quarter(), [1, 1, 1, 1]);
  assert.deepEqual(second, first);
});

test("concave areas and houses without position are handled", () => {
  const ell: Shape = [[[at(0, 0), at(1000, 0), at(1000, 400), at(400, 400), at(400, 1000), at(0, 1000)]]];
  const streets = quarter()
    .map((s) => {
      const numbers = (s.numbers ?? []).filter((h) => shapeContains(ell, [h.lat!, h.lng!]));
      return { ...s, numbers, units: numbers.reduce((sum, h) => sum + Math.max(1, h.units), 0) };
    })
    .filter((s) => s.numbers.length > 0);
  // Ein Haus ohne Lage geht mit seiner Strasse, eine Strasse ganz ohne Lage dorthin, wo noch Platz ist.
  streets[0].numbers.push({ number: "99", units: 1, lat: null, lng: null });
  streets.push({ name: "Ohne Lage", houseNumbers: "", units: 5, lat: null, lng: null, numbers: [] });
  const plots = splitIntoPlots(ell, streets, [1, 1, 1]);
  assertConsistent(plots);
  const withNinetyNine = plots.filter((plot) => plot.streets.some((s) => s.name === streets[0].name && s.numbers?.some((h) => h.number === "99")));
  assert.equal(withNinetyNine.length, 1);
  assert.equal(plots.filter((plot) => plot.streets.some((s) => s.name === "Ohne Lage")).length, 1);
});

test("fewer houses than parts leaves the extra parts empty instead of failing", () => {
  const plots = splitIntoPlots(AREA, [street("Kurz", [[100, 100], [900, 900]])], [1, 1, 1]);
  assert.equal(plots.length, 3);
  assert.equal(plots.filter((plot) => plot.streets.length > 0).length, 2);
  assertConsistent(plots.filter((plot) => plot.streets.length > 0));
});

test("the server regroups an old whole-street split by area", () => {
  // So hat die alte App aufgeteilt: links/rechts als Flaeche, aber die ganze Hauptstrasse links.
  const left = square(0, 0, 500, 1000);
  const right = square(500, 0, 1000, 1000);
  const main = street("Hauptstraße", Array.from({ length: 10 }, (_, i) => [50 + i * 100, 500] as [number, number]));
  const side = street("Seitenweg", [[700, 200], [720, 260]]);
  const regrouped = regroupByArea([
    { area: left, streets: [main] },
    { area: right, streets: [side] },
  ]);
  assertConsistent([
    { streets: regrouped[0], area: left },
    { streets: regrouped[1], area: right },
  ]);
  assert.deepEqual(regrouped[0].map((s) => [s.name, s.houseNumbers]), [["Hauptstraße", "1-5"]]);
  assert.deepEqual(regrouped[1].map((s) => [s.name, s.houseNumbers]).sort(), [["Hauptstraße", "6-10"], ["Seitenweg", "1-2"]]);

  // Eine neue App schickt geteilte Strassen - sie kommen zusammen und landen wieder richtig.
  const again = regroupByArea([
    { area: left, streets: regrouped[0] },
    { area: right, streets: regrouped[1] },
  ]);
  assert.deepEqual(again, regrouped);

  // Ohne Flaeche bleibt alles, wo die App es hingelegt hat.
  const free = regroupByArea([
    { area: null, streets: [side] },
    { area: null, streets: [main] },
  ]);
  assert.deepEqual(free.map((group) => group.map((s) => s.name)), [["Seitenweg"], ["Hauptstraße"]]);
});

/* ----------------------- Gruppen und Zusammenlegen ----------------------- */

const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Aufteilen')").run().lastInsertRowid);
let sequence = 0;
function person(role: "LEADER" | "MEMBER", managerId: number | null = null): User {
  const name = `split-${++sequence}`;
  const id = Number(
    db.prepare("INSERT INTO users(team_id, manager_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)")
      .run(team, managerId, name, `${name}@example.test`, hashPassword("password123"), role).lastInsertRowid,
  );
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
}
const leader = person("LEADER");
const anna = person("MEMBER", leader.id);
const ben = person("MEMBER", leader.id);

function splitInto(name: string, areas: Shape[], streets: StreetInput[][], assignees: Array<number | null>): number[] {
  return createTerritories(
    team,
    areas.map((area, index) => ({
      name: `${name} (${index + 1}/${areas.length})`,
      city: "",
      postalCode: "",
      assignedUserId: assignees[index],
      note: "",
      dueDate: null,
      areaJson: shapeToJson(area),
      streets: streets[index],
    })),
    leader.id,
    name,
  );
}

function houses(territoryId: number): string[] {
  return (
    db
      .prepare(
        `SELECT s.name || ' ' || h.number AS label FROM house_numbers h JOIN streets s ON s.id = h.street_id
          WHERE s.territory_id = ? ORDER BY s.name, h.sort_order`,
      )
      .all(territoryId) as Array<{ label: string }>
  ).map((row) => row.label);
}

test("split territories form a group with combined progress", () => {
  const areas = [square(2000, 0, 2500, 500), square(2500, 0, 3000, 500)];
  const ids = splitInto("Nordstadt", areas, [[street("Am Teich", [[2100, 100], [2200, 100]])], [street("Bachweg", [[2600, 100]])]], [anna.id, ben.id]);
  const group = (getTerritory(ids[0], team)!).group_id;
  assert.ok(group);
  assert.equal(getTerritory(ids[1], team)!.group_id, group);
  assert.equal((db.prepare("SELECT name FROM territory_groups WHERE id = ?").get(group) as { name: string }).name, "Nordstadt");

  const parts = groupMembers(leader, group);
  assert.deepEqual(parts.map((part) => part.id), ids);
  assert.equal(combinedProgress(parts).total, 3);
  // Wer nur ein Teilgebiet hat, sieht auch nur das.
  assert.deepEqual(groupMembers(anna, group).map((part) => part.id), [ids[0]]);
  // Einzelne Gebiete bekommen keine Gruppe.
  const [single] = createTerritories(team, [{ name: "Solo", city: "", postalCode: "", assignedUserId: null, note: "", dueDate: null, areaJson: "", streets: [] }], leader.id, "Solo");
  assert.equal(getTerritory(single, team)!.group_id, null);
});

test("merging moves streets, houses, bells and visits, unites the areas and dissolves the group", () => {
  const areas = [square(4000, 0, 4500, 500), square(4500, 0, 5000, 500), square(5000, 0, 5500, 500)];
  const long = street("Lange Straße", [[4100, 250], [4300, 250], [4600, 250], [4800, 250], [5200, 250]]);
  const parts = regroupByArea(areas.map((area) => ({ area, streets: [long] })));
  const ids = splitInto("Weststadt", areas, parts, [anna.id, ben.id, null]);
  const group = getTerritory(ids[0], team)!.group_id!;

  // Besuch und Klingel in Teil 2, Sperre in Teil 3.
  const streetTwo = (db.prepare("SELECT id FROM streets WHERE territory_id = ?").get(ids[1]) as { id: number }).id;
  const houseTwo = (db.prepare("SELECT id, number FROM house_numbers WHERE street_id = ? ORDER BY sort_order").get(streetTwo) as { id: number; number: string });
  db.prepare("INSERT INTO visits(team_id, user_id, territory_id, street_id, house_number, outcome) VALUES (?, ?, ?, ?, ?, 'SALE')").run(team, ben.id, ids[1], streetTwo, houseTwo.number);
  db.prepare("INSERT INTO doorbells(house_number_id, label) VALUES (?, 'Meier')").run(houseTwo.id);
  db.prepare("UPDATE house_numbers SET blocked_at = datetime('now') WHERE street_id = (SELECT id FROM streets WHERE territory_id = ?)").run(ids[2]);
  db.prepare("UPDATE territories SET status = 'DONE' WHERE id = ?").run(ids[0]);

  // Nur Teilgebiete derselben Gruppe.
  const [stranger] = createTerritories(team, [{ name: "Fremd", city: "", postalCode: "", assignedUserId: null, note: "", dueDate: null, areaJson: "", streets: [] }], leader.id);
  assert.throws(() => mergeTerritories(leader, ids[0], [stranger]), /desselben Gebiets/);
  // Wer ein Teilgebiet nicht sehen darf, kann es auch nicht holen.
  assert.throws(() => mergeTerritories(anna, ids[0], [ids[1]]), /nicht freigegeben/);

  const before = [...houses(ids[0]), ...houses(ids[1]), ...houses(ids[2])].sort();
  mergeTerritories(leader, ids[0], [ids[1]]);
  assert.equal(getTerritory(ids[1], team), null);
  assert.equal(getTerritory(ids[0], team)!.group_id, group, "ein Teil fehlt noch - die Gruppe bleibt");
  assert.equal(getTerritory(ids[0], team)!.status, "ACTIVE", "nicht mehr fertig, sobald unbearbeitete Häuser dazukommen");

  mergeTerritories(leader, ids[0], [ids[2]]);
  const merged = getTerritory(ids[0], team)!;
  assert.deepEqual(houses(ids[0]).sort(), before);
  assert.equal(merged.name, "Weststadt");
  assert.equal(merged.group_id, null);
  assert.equal(db.prepare("SELECT 1 FROM territory_groups WHERE id = ?").get(group), undefined);
  assert.equal(merged.sale_count, 1, "der Abschluss zählt jetzt hier");
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM doorbells d JOIN house_numbers h ON h.id = d.house_number_id JOIN streets s ON s.id = h.street_id WHERE s.territory_id = ?").get(ids[0]) as { c: number }).c, 1);
  // Die Strasse der Klingel behaelt ihre Nummer - offline gespeicherte Besuche passen weiter.
  assert.equal((db.prepare("SELECT territory_id FROM streets WHERE id = ?").get(streetTwo) as { territory_id: number }).territory_id, ids[0]);
  // Eine Flaeche fuer alles.
  const area = readShape(merged.area_json)!;
  for (const [x, y] of [[4100, 250], [4800, 250], [5200, 250]] as const) assert.ok(shapeContains(area, at(x, y)));
  // Die Haelften der langen Strasse stehen hintereinander.
  assert.deepEqual(listStreets(ids[0]).map((s) => s.name), ["Lange Straße", "Lange Straße", "Lange Straße"]);
});

test("parts are listed with a short title under the name of the whole", () => {
  assert.equal(partTitle("Nordstadt – KW 44 (2/3)", "Nordstadt – KW 44"), "Teil 2 von 3");
  assert.equal(partTitle("Nordstadt Ost", "Nordstadt"), "Ost");
  assert.equal(partTitle("Ganz anders", "Nordstadt"), "Ganz anders");
});

/* ------------------------------ Abgleichen ------------------------------- */

test("reconcile: outside houses move to the area they lie in, worked ones stay, misplaced ones come home", () => {
  // Ein Gebiet, das die alte Aufteilung kaputt gemacht hat: Teil 1 hat die ganze
  // Hauptstrasse, obwohl die Haelfte davon in Teil 2 liegt.
  const left = square(6000, 0, 6500, 500);
  const right = square(6500, 0, 7000, 500);
  const main = street("Hauptstraße", [[6100, 250], [6200, 250], [6600, 250], [6700, 250]]);
  const ids = createTerritories(
    team,
    [
      { name: "Alt 1", city: "", postalCode: "", assignedUserId: anna.id, note: "", dueDate: null, areaJson: shapeToJson(left), streets: [main] },
      { name: "Alt 2", city: "", postalCode: "", assignedUserId: ben.id, note: "", dueDate: null, areaJson: shapeToJson(right), streets: [street("Nebenweg", [[6800, 100]])] },
    ],
    leader.id,
  );
  // Hauptstrasse 4 liegt rechts, wurde aber links schon besucht - die bleibt.
  const mainStreet = (db.prepare("SELECT id FROM streets WHERE territory_id = ? AND name = 'Hauptstraße'").get(ids[0]) as { id: number }).id;
  db.prepare("INSERT INTO visits(team_id, user_id, territory_id, street_id, house_number, outcome) VALUES (?, ?, ?, ?, '4', 'NOT_HOME')").run(team, anna.id, ids[0], mainStreet);

  const preview = reconcileTerritory(leader, ids[0], { streetList: [] }, false);
  assert.deepEqual(
    { removed: preview.removed, moved: preview.moved, keptWorked: preview.keptWorked, added: preview.added, pulled: preview.pulled },
    { removed: 1, moved: 1, keptWorked: 1, added: 0, pulled: 0 },
  );
  assert.deepEqual(houses(ids[0]), ["Hauptstraße 1", "Hauptstraße 2", "Hauptstraße 3", "Hauptstraße 4"], "die Vorschau ändert nichts");

  const done = reconcileTerritory(leader, ids[0], { streetList: [] }, true);
  assert.deepEqual(done, preview, "gespeichert wird, was die Vorschau gezeigt hat");
  assert.deepEqual(houses(ids[0]), ["Hauptstraße 1", "Hauptstraße 2", "Hauptstraße 4"]);
  assert.deepEqual(houses(ids[1]), ["Hauptstraße 3", "Nebenweg 1"]);
  // Die Spanne der Strasse stimmt wieder.
  assert.equal((db.prepare("SELECT house_numbers FROM streets WHERE id = ?").get(mainStreet) as { house_numbers: string }).house_numbers, "1-4");

  // Andersherum: Teil 2 holt sich, was bei Teil 1 falsch liegt.
  db.prepare("INSERT INTO house_numbers(street_id, number, units, lat, lng) VALUES (?, '9', 1, ?, ?)").run(mainStreet, ...at(6900, 250));
  const pulled = reconcileTerritory(leader, ids[1], { streetList: [] }, true);
  assert.equal(pulled.pulled, 1);
  assert.ok(houses(ids[1]).includes("Hauptstraße 9"));
  assert.ok(!houses(ids[0]).includes("Hauptstraße 9"));
});

test("reconcile with a new area adds new houses, drops unworked ones outside and saves the area", () => {
  const ids = createTerritories(
    team,
    [{ name: "Ost", city: "", postalCode: "", assignedUserId: anna.id, note: "", dueDate: null, areaJson: shapeToJson(square(8000, 0, 8500, 500)), streets: [street("Feldweg", [[8100, 100], [8400, 100]])] }],
    leader.id,
  );
  const smaller = square(8000, 0, 8300, 600);
  const fromMap = [street("Feldweg", [[8100, 100], [8200, 100]]), street("Neue Allee", [[8100, 550], [8200, 550]])];
  const summary = reconcileTerritory(leader, ids[0], { area: smaller, streetList: fromMap }, true);
  assert.deepEqual(
    { added: summary.added, addedStreets: summary.addedStreets, removed: summary.removed, areaChanged: summary.areaChanged },
    { added: 3, addedStreets: 1, removed: 1, areaChanged: true },
  );
  assert.deepEqual(houses(ids[0]), ["Feldweg 1", "Feldweg 2", "Neue Allee 1", "Neue Allee 2"]);
  assert.ok(shapeContains(readShape(getTerritory(ids[0], team)!.area_json)!, at(8100, 550)));
  // Nichts mehr zu tun.
  const again = reconcileTerritory(leader, ids[0], { streetList: fromMap }, false);
  assert.equal(again.added + again.removed + again.pulled, 0);
  // Ohne Recht auf das Gebiet kein Abgleich.
  assert.throws(() => reconcileTerritory(ben, ids[0], { streetList: [] }, false), /nicht freigegeben/);
});

test("the map shows who worked a territory without an assignee", () => {
  const [id] = createTerritories(team, [{ name: "Verwaist", city: "", postalCode: "", assignedUserId: null, note: "", dueDate: null, areaJson: "", streets: [] }], leader.id);
  const visit = db.prepare("INSERT INTO visits(team_id, user_id, territory_id, outcome) VALUES (?, ?, ?, 'NOT_HOME')");
  visit.run(team, anna.id, id);
  visit.run(team, ben.id, id);
  visit.run(team, ben.id, id);
  assert.equal(topWorkers(team, [id]).get(id)?.name, ben.name);
  assert.equal(topWorkers(team, []).size, 0);
});
