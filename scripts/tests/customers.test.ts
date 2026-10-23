import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { clearCustomer, countCustomers, exportCustomers, getCustomer, listCustomers, saveCustomer } from "../../src/lib/customers";
import { contractEnd, contractStatus, normalizeDay, recallUntil, RECALL_LEAD_DAYS } from "../../src/lib/contracts";
import { hasPermission, permissionsFor, updatePermissions } from "../../src/lib/permissions";
import { navigation } from "../../src/lib/nav";
import type { User } from "../../src/lib/types";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-customers-"));
const previous = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = path.join(directory, "test.db");
const db = getDb();
after(() => {
  db.close(); global.__d2dDb = undefined;
  if (previous === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previous;
  rmSync(directory, { recursive: true, force: true });
});

const TODAY = "2026-10-22";
let sequence = 0;
function fixture() {
  const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Kunden')").run().lastInsertRowid);
  const person = (role: string, teamId = team) => {
    const name = `customer-${++sequence}`;
    const id = Number(db.prepare("INSERT INTO users(team_id, name, email, password_hash, role) VALUES (?, ?, ?, '', ?)")
      .run(teamId, name, `${name}@example.test`, role).lastInsertRowid);
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
  };
  const leader = person("LEADER"), member = person("MEMBER");
  const territoryId = Number(db.prepare("INSERT INTO territories(team_id, name, city, postal_code) VALUES (?, 'Nord', 'Kiel', '24103')")
    .run(team).lastInsertRowid);
  const streetId = Number(db.prepare("INSERT INTO streets(territory_id, name) VALUES (?, 'Holstenstraße')").run(territoryId).lastInsertRowid);
  const visit = (outcome = "SALE", houseNumber = "12", user = member, created = "2026-10-01 17:00:00") =>
    Number(db.prepare(`INSERT INTO visits(team_id, user_id, territory_id, street_id, house_number, outcome, energy_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(team, user.id, territoryId, streetId, houseNumber, outcome, outcome === "SALE" ? "STROM" : "", created).lastInsertRowid);
  return { team, leader, member, person, visit };
}

test("contract end is the day before start plus term; missing days end on the month's last day", () => {
  assert.equal(contractEnd("2026-11-01", 12), "2027-10-31");
  assert.equal(contractEnd("2026-11-15", 24), "2028-11-14");
  assert.equal(contractEnd("2026-01-31", 1), "2026-02-28");
  assert.equal(contractEnd("2027-12-31", 2), "2028-02-29");
  assert.equal(contractEnd("2026-03-01", 12), "2027-02-28");
  assert.equal(contractEnd("", 12), "");
  assert.equal(contractEnd("2026-11-01", 0), "");
});

test("dates from the booking portal are read in German and ISO notation", () => {
  assert.equal(normalizeDay("31.10.2027"), "2027-10-31");
  assert.equal(normalizeDay("1.2.2027"), "2027-02-01");
  assert.equal(normalizeDay("2027-10-31"), "2027-10-31");
  assert.equal(normalizeDay("2027-02-30"), "");
  assert.equal(normalizeDay("30.02.2027"), "");
  assert.equal(normalizeDay("morgen"), "");
});

test("contract status tells ended, due and running contracts apart", () => {
  assert.equal(recallUntil(TODAY), "2026-12-21");
  assert.equal(contractStatus("2026-10-01", TODAY).tone, "ended");
  assert.equal(contractStatus("2026-10-22", TODAY).label, "Endet heute");
  assert.equal(contractStatus("2026-10-30", TODAY).label, "Endet in 8 Tagen");
  assert.equal(contractStatus(recallUntil(TODAY), TODAY).tone, "due");
  assert.equal(contractStatus("2027-10-31", TODAY).label, "Läuft bis 31.10.2027");
  assert.equal(contractStatus(null, TODAY).tone, "unknown");
  assert.equal(RECALL_LEAD_DAYS, 60);
});

test("only leaders hold the customer list by default; it can be granted and shows in navigation", () => {
  const f = fixture();
  assert.equal(hasPermission(f.leader, "customers.manage"), true);
  assert.equal(hasPermission(f.member, "customers.manage"), false);
  assert.ok(!navigation(f.member.role, permissionsFor(f.member)).items.some((item) => item.href === "/kunden"));
  assert.ok(navigation(f.leader.role, permissionsFor(f.leader)).items.some((item) => item.href === "/kunden"));
  updatePermissions(f.leader, f.member.id, { "customers.manage": true });
  assert.equal(hasPermission(f.member, "customers.manage"), true);
});

test("a leader assigns a customer to an order; the end date follows start and term", () => {
  const f = fixture();
  const sale = f.visit();
  assert.deepEqual(countCustomers(f.team, TODAY), { total: 1, open: 1, due: 0 });
  assert.equal(listCustomers(f.team, { view: "offen", today: TODAY })[0].visit_id, sale);

  const saved = saveCustomer(f.leader, sale, {
    name: "Erika Mustermann", phone: "0171 2345678", customerNumber: "EP-4711",
    contractStart: "01.11.2026", contractMonths: 12, contractEnd: "", note: "Abends erreichbar",
  });
  assert.equal(saved.name, "Erika Mustermann");
  assert.equal(saved.contract_start, "2026-11-01");
  assert.equal(saved.contract_end, "2027-10-31");
  assert.equal(saved.city, "Kiel");
  assert.equal(saved.user_name, f.member.name);
  assert.deepEqual(countCustomers(f.team, TODAY), { total: 1, open: 0, due: 0 });

  // Nur mitgeschickte Felder aendern sich.
  saveCustomer(f.leader, sale, { note: "Lieber vormittags" });
  const current = getCustomer(f.team, sale)!;
  assert.equal(current.phone, "0171 2345678");
  assert.equal(current.note, "Lieber vormittags");
});

test("invalid input, foreign orders and non-sales are rejected", () => {
  const f = fixture();
  const sale = f.visit();
  assert.throws(() => saveCustomer(f.leader, sale, { phone: "ruf mich an" }), /Telefonnummer/);
  assert.throws(() => saveCustomer(f.leader, sale, { contractEnd: "31.02.2027" }), /kein gültiges Datum/);
  assert.throws(() => saveCustomer(f.leader, sale, { contractMonths: 0 }), /Laufzeit/);
  assert.throws(() => saveCustomer(f.leader, sale, { contractStart: "2027-01-01", contractEnd: "2026-12-31" }), /vor dem Lieferbeginn/);
  assert.throws(() => saveCustomer(f.leader, f.visit("APPOINTMENT"), { name: "Termin" }), /Abschluss/);

  const other = fixture();
  assert.throws(() => saveCustomer(other.leader, sale, { name: "Fremd" }), /nicht gefunden/);
  assert.throws(() => clearCustomer(other.leader, sale), /nicht gefunden/);
  assert.equal(getCustomer(other.team, sale), null);
  assert.equal(getCustomer(f.team, sale)!.name, "");
});

test("contracts ending soon are due until someone re-advised; a new end date starts over", () => {
  const f = fixture();
  const ended = f.visit("SALE", "1");
  const soon = f.visit("SALE", "2");
  const later = f.visit("SALE", "3");
  saveCustomer(f.leader, ended, { name: "A", contractEnd: "2026-09-30" });
  saveCustomer(f.leader, soon, { name: "B", contractEnd: "2026-12-01" });
  saveCustomer(f.leader, later, { name: "C", contractEnd: "2027-06-30" });
  assert.deepEqual(listCustomers(f.team, { view: "faellig", today: TODAY }).map((row) => row.name), ["A", "B"]);

  saveCustomer(f.leader, ended, { recontacted: true });
  assert.ok(getCustomer(f.team, ended)!.recontacted_at);
  assert.equal(countCustomers(f.team, TODAY).due, 1);
  // Erneutes Abhaken behaelt den ersten Zeitpunkt.
  const first = getCustomer(f.team, ended)!.recontacted_at;
  saveCustomer(f.leader, ended, { recontacted: true });
  assert.equal(getCustomer(f.team, ended)!.recontacted_at, first);

  // Umberaten mit neuem Vertrag: neues Ende, neue Wiedervorlage.
  saveCustomer(f.leader, ended, { contractStart: "2026-11-01", contractMonths: 24, contractEnd: "" });
  const renewed = getCustomer(f.team, ended)!;
  assert.equal(renewed.contract_end, "2028-10-31");
  assert.equal(renewed.recontacted_at, null);

  saveCustomer(f.leader, soon, { recontacted: true });
  saveCustomer(f.leader, soon, { recontacted: false });
  assert.equal(countCustomers(f.team, TODAY).due, 1);
});

test("search finds customers by name, phone and seller and treats wildcards literally", () => {
  const f = fixture();
  const first = f.visit("SALE", "7");
  const second = f.visit("SALE", "9");
  saveCustomer(f.leader, first, { name: "Jörg Petersen", phone: "+49 431 555" });
  saveCustomer(f.leader, second, { name: "100% Ökostrom GmbH" });
  const search = (query: string) => listCustomers(f.team, { view: "alle", today: TODAY, query }).map((row) => row.visit_id);
  assert.deepEqual(search("Petersen"), [first]);
  assert.deepEqual(search("431"), [first]);
  assert.deepEqual(search("%"), [second]);
  assert.deepEqual(search("_"), []);
  assert.equal(search(f.member.name).length, 2);
});

test("undoing a sale removes its customer data; clearing keeps the sale", () => {
  const f = fixture();
  const sale = f.visit();
  const kept = f.visit("SALE", "14");
  saveCustomer(f.leader, sale, { name: "Weg", phone: "040 123456" });
  saveCustomer(f.leader, kept, { name: "Bleibt", phone: "040 654321" });
  db.prepare("DELETE FROM visits WHERE id = ?").run(sale);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sale_customers WHERE visit_id = ?").get(sale) as { n: number }).n, 0);

  clearCustomer(f.leader, kept);
  assert.equal(getCustomer(f.team, kept)!.name, "");
  assert.deepEqual(countCustomers(f.team, TODAY), { total: 1, open: 1, due: 0 });
  assert.equal(exportCustomers(f.team).length, 1);
});
