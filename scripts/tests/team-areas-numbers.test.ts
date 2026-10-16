import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { AuthError, hashPassword } from "../../src/lib/auth";
import { assertNoExtraRights, permissionsFor, updatePermissions } from "../../src/lib/permissions";
import { createInvitation, decideInvitation, invitationDashboard, registerInvitation } from "../../src/lib/invitations";
import { addStreetEntries, blockedDoorCount, ensureHouseNumber, getTerritory, withoutTakenHouses, type StreetInput } from "../../src/lib/queries";
import { territoryProgress } from "../../src/lib/progress";
import { chaseLine, hasPlaces, metricByKey, rank } from "../../src/lib/ranking";
import type { PersonTotals } from "../../src/lib/community";
import { columnFor } from "../../src/lib/energy/table";
import { annualCost } from "../../src/lib/energy/refresh";
import { providerLookup } from "../../src/lib/energy/provider";
import { saveManualPrice } from "../../src/lib/energy/manual";
import type { User } from "../../src/lib/types";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-round4-"));
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

const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Runde 4')").run().lastInsertRowid);
let sequence = 0;
function person(role: "LEADER" | "MEMBER", managerId: number | null = null): User {
  const name = `r4-${++sequence}`;
  const id = Number(
    db.prepare("INSERT INTO users(team_id, manager_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)")
      .run(team, managerId, name, `${name}@example.test`, hashPassword("password123"), role).lastInsertRowid,
  );
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
}
const fresh = (user: User) => db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as User;
const leader = person("LEADER");

/* ------------------------------- Rechte -------------------------------- */

test("a manager cannot take over a report's account that holds rights the manager lacks", () => {
  const manager = person("MEMBER", leader.id);
  const report = person("MEMBER", manager.id);
  assert.doesNotThrow(() => assertNoExtraRights(manager, report));
  db.prepare("INSERT INTO user_permissions(user_id, permission, allowed, granted_by) VALUES (?, 'reports.team', 1, ?)").run(report.id, leader.id);
  assert.throws(() => assertNoExtraRights(fresh(manager), fresh(report)), (error) => error instanceof AuthError && error.status === 403);
  // Die Teamleitung darf immer.
  assert.doesNotThrow(() => assertNoExtraRights(leader, fresh(report)));
});

test("rights the actor lacks cannot be granted to a deactivated person and switched on by reactivating", () => {
  const manager = person("MEMBER", leader.id);
  const report = person("MEMBER", manager.id);
  person("MEMBER", manager.id); // noch jemand Aktives in der Struktur: Rechte vergeben bleibt erlaubt
  db.prepare("INSERT INTO user_permissions(user_id, permission, allowed, granted_by) VALUES (?, 'territories.delete', 0, ?)").run(manager.id, leader.id);
  assert.throws(() => updatePermissions(fresh(manager), report.id, { "territories.create": true }), /zusätzliche Rechte/);
  db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(report.id);
  assert.throws(() => updatePermissions(fresh(manager), report.id, { "territories.create": true }), /zusätzliche Rechte/);
  db.prepare("UPDATE users SET active = 1 WHERE id = ?").run(report.id);
  assert.equal(permissionsFor(fresh(report))["territories.delete"], false);
});

test("join requests of a deactivated manager's reports go to the team lead instead of hanging", () => {
  const manager = person("MEMBER", leader.id);
  const inviter = person("MEMBER", manager.id);
  const { token } = createInvitation(inviter.id);
  registerInvitation(token, { name: "Neu", email: "neu-r4@example.test", password: "password123" });
  const request = db.prepare("SELECT r.id FROM join_requests r JOIN invitation_links l ON l.id = r.invitation_id WHERE l.token = ?").get(token) as { id: number };
  db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(manager.id);

  assert.equal(invitationDashboard(fresh(leader)).approvals.length, 1);
  assert.match(invitationDashboard(fresh(inviter)).problem ?? "", /Führungskraft ist nicht mehr aktiv/);
  decideInvitation(leader.id, request.id, "APPROVED");
  const created = db.prepare("SELECT manager_id FROM users WHERE email = 'neu-r4@example.test'").get() as { manager_id: number };
  assert.equal(created.manager_id, inviter.id);
});

/* ------------------------------- Gebiete ------------------------------- */

// Ein schlichter Ring, so wie shapeToJson ihn speichert.
const square = (lat: number, lng: number, size = 0.002) =>
  JSON.stringify([[lat, lng], [lat + size, lng], [lat + size, lng + size], [lat, lng + size]]);
const territory = (name: string, area = "") =>
  Number(db.prepare("INSERT INTO territories(team_id, name, area_json) VALUES (?, ?, ?)").run(team, name, area).lastInsertRowid);
const street = (territoryId: number, name: string, units = 0) =>
  Number(db.prepare("INSERT INTO streets(territory_id, name, units) VALUES (?, ?, ?)").run(territoryId, name, units).lastInsertRowid);
const house = (number: string, lat: number | null, lng: number | null) => ({ number, units: 1, lat, lng });

test("houses that already belong to another territory are not imported a second time", () => {
  const taken = territory("Vergeben", square(51.5, 7.4));
  const elsewhere = territory("Nachbar");
  addStreetEntries(elsewhere, [{ name: "Querstraße", houseNumbers: "1-3", units: 3, lat: 51.6, lng: 7.5, numbers: [house("1", 51.6, 7.5), house("2", 51.6001, 7.5)] }]);
  const entries: StreetInput[] = [
    // liegt in der Flaeche von "Vergeben"
    { name: "Innenweg", houseNumbers: "1", units: 1, lat: 51.501, lng: 7.401, numbers: [house("1", 51.501, 7.401)] },
    // gleiche Strasse, gleiche Nummer, gleiche Stelle wie im Nachbargebiet - plus eine neue Nummer
    { name: "Querstraße", houseNumbers: "1-3", units: 3, lat: 51.6, lng: 7.5, numbers: [house("1", 51.6, 7.5), house("3", 51.6002, 7.5)] },
    // gleicher Name und gleiche Nummer, aber in einer anderen Stadt
    { name: "Querstraße", houseNumbers: "2", units: 1, lat: 52.5, lng: 13.4, numbers: [house("2", 52.5, 13.4)] },
  ];
  const kept = withoutTakenHouses(team, entries);
  assert.deepEqual(kept.map((entry) => [entry.name, entry.numbers?.map((h) => h.number)]), [
    ["Querstraße", ["3"]],
    ["Querstraße", ["2"]],
  ]);
  assert.equal(taken > 0, true);
});

test("an imported '21a' is the same house as a typed '21A'", () => {
  const id = territory("Schreibweise");
  const streetId = street(id, "Ahornweg");
  ensureHouseNumber(streetId, "21A");
  addStreetEntries(id, [{ name: "Ahornweg", houseNumbers: "21a", units: 1, lat: 51.5, lng: 7.4, numbers: [house("21a", 51.5, 7.4)] }]);
  const rows = db.prepare("SELECT number, lat FROM house_numbers WHERE street_id = ?").all(streetId) as Array<{ number: string; lat: number | null }>;
  assert.deepEqual(rows, [{ number: "21A", lat: 51.5 }]);
});

test("progress of streets from a list counts their units, not just the first typed number", () => {
  const id = territory("Liste");
  const first = street(id, "Bahnhofstraße", 30);
  street(id, "Gartenweg", 20);
  assert.equal(territoryProgress(getTerritory(id, team)!).label, "0 von 50 Türen");
  ensureHouseNumber(first, "1");
  db.prepare("INSERT INTO visits(team_id, user_id, territory_id, street_id, house_number, outcome) VALUES (?, ?, ?, ?, '1', 'NOT_HOME')")
    .run(team, leader.id, id, first);
  assert.equal(territoryProgress(getTerritory(id, team)!).label, "1 von 50 Türen");

  // Mit Kartenimport bleibt es bei Haeusern.
  const mapped = territory("Karte");
  addStreetEntries(mapped, [{ name: "Lindenweg", houseNumbers: "1-2", units: 2, lat: 51.5, lng: 7.4, numbers: [house("1", 51.5, 7.4), house("2", 51.5001, 7.4)] }]);
  assert.equal(territoryProgress(getTerritory(mapped, team)!).label, "0 von 2 Häusern");
});

test("blocked doors are counted before a street or territory may be deleted", () => {
  const id = territory("Sperren");
  const streetId = street(id, "Ringstraße");
  const houseId = ensureHouseNumber(streetId, "4");
  assert.equal(blockedDoorCount({ streetId }), 0);
  db.prepare("UPDATE house_numbers SET blocked_at = datetime('now') WHERE id = ?").run(houseId);
  const bell = Number(db.prepare("INSERT INTO doorbells(house_number_id, label, blocked_at) VALUES (?, 'Müller', datetime('now'))").run(houseId).lastInsertRowid);
  assert.equal(bell > 0, true);
  assert.equal(blockedDoorCount({ streetId }), 2);
  assert.equal(blockedDoorCount({ territoryId: id }), 2);
});

/* ------------------------------- Zahlen -------------------------------- */

const totals = (rows: Array<[string, number, number]>): PersonTotals[] =>
  rows.map(([name, sales, met], index) => ({ user_id: index + 1, user_name: name, avatar: "", role: "MEMBER", doors: met * 2, met, sales, appointments: 0 }));

test("a board where everyone is at zero has no places and no movement", () => {
  const sales = metricByKey("sales");
  const empty = rank(sales, totals([["Anna", 0, 0], ["Ben", 0, 0]]));
  assert.equal(hasPlaces(sales, empty), false);
  assert.match(chaseLine(sales, empty, 1) ?? "", /Platz 1 ist frei/);
  assert.equal(hasPlaces(sales, rank(sales, totals([["Anna", 1, 3], ["Ben", 0, 2]]))), true);
});

test("rate gaps below one point read 'knapp', not '1 Prozentpunkt'", () => {
  const rate = metricByKey("close_rate");
  const board = rank(rate, totals([["Anna", 53, 631], ["Ben", 49, 585]]));
  assert.equal(chaseLine(rate, board, 2), "Knapp hinter Anna auf Platz 1.");
  assert.equal(chaseLine(rate, board, 1), "Du führst knapp vor Ben.");
});

/* ------------------------------- Energie ------------------------------- */

test("yearly basic price columns are recognised by their unit, whatever the spelling", () => {
  for (const header of ["Grundpreis Strom €/a", "Grundpreis (EUR/a)", "Grundpreis p.a.", "Grundpreis pro Jahr", "strom_base_eur"]) {
    assert.equal(columnFor(header)?.yearly, true, header);
  }
  for (const header of ["Strom Grundpreis €/Monat", "Grundpreis (€)", "Grundpreis EUR", "Grundpreis EUR/Mon"]) {
    assert.equal(columnFor(header)?.yearly, false, header);
  }
});

test("a price without a basic price is rated with the reference basic price, not as zero", () => {
  assert.equal(annualCost(40.12, null, 3500), 1404);
  assert.equal(annualCost(40.12, null, 3500, 165.12), 1569);
  assert.equal(annualCost(40.12, 150, 3500, 165.12), 1554);
});

test("towns that only differ by their bracketed suffix do not share a price", () => {
  const priceTeam = Number(db.prepare("INSERT INTO teams(name) VALUES ('Preise')").run().lastInsertRowid);
  const base = { provider: "EAM", gas_provider: "", lat: null, lng: null, strom_ct_kwh: 44.5, strom_base_eur: 150, gas_ct_kwh: null, gas_base_eur: null, valid_from: "", source_url: "" };
  saveManualPrice(priceTeam, leader.id, { ...base, postal_code: "34613", city: "Neustadt (Hessen)" });
  const lookup = providerLookup(priceTeam);
  assert.equal(lookup.find({ postal_code: "16845", city: "Neustadt (Dosse)" }), null);
  assert.equal(lookup.find({ postal_code: "34612", city: "Neustadt (Hessen)" })?.match, "city");
  assert.equal(lookup.find({ city: "Neustadt" })?.provider, "EAM");
});
