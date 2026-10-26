import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth";
import { recordVisit } from "../../src/lib/record-visit";
import { dayLabel, doorOpen, doorStatus, whenLabel } from "../../src/lib/doors";
import { ensureDoorbell, ensureHouseNumber, getTerritory, listDoorbells, listHouseNumbers } from "../../src/lib/queries";
import { doorLast, doorText, saleText } from "../../src/app/(app)/tour/model";
import type { User } from "../../src/lib/types";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-door-list-"));
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

const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Klingeln')").run().lastInsertRowid);
const memberId = Number(
  db.prepare("INSERT INTO users(team_id, name, email, password_hash, role) VALUES (?, 'Alex Becker', 'alex@example.test', ?, 'MEMBER')")
    .run(team, hashPassword("password123")).lastInsertRowid,
);
const member = db.prepare("SELECT * FROM users WHERE id = ?").get(memberId) as User;
const territoryId = Number(
  db.prepare("INSERT INTO territories(team_id, name, assigned_user_id) VALUES (?, 'Süd', ?)").run(team, member.id).lastInsertRowid,
);
const streetId = Number(db.prepare("INSERT INTO streets(territory_id, name) VALUES (?, 'Lindenweg')").run(territoryId).lastInsertRowid);

const NO_VISIT = {
  last_outcome: null,
  last_reason_label: null,
  last_reason_icon: null,
  last_visit_at: null,
  last_visit_user: null,
  last_visit_user_id: null,
};

test("no result closes a door - only an explicit block does", () => {
  const facts = (notHome: number, met: number, blocked: string | null = null) => ({
    blocked_at: blocked,
    not_home_count: notHome,
    met_count: met,
  });
  assert.equal(doorStatus(facts(0, 0)), "OPEN");
  // Kein Limit mehr: auch beim zehnten "nicht da" bleibt die Tuer offen.
  assert.equal(doorStatus(facts(10, 0)), "RETRY");
  assert.equal(doorOpen(facts(10, 0)), true);
  assert.equal(doorStatus(facts(2, 1)), "MET");
  assert.equal(doorOpen(facts(2, 1)), false);
  assert.equal(doorStatus(facts(0, 3, "2026-01-01 10:00:00")), "BLOCKED");
});

test("a sale stays visible with its date and the door can be met again", () => {
  const houseId = ensureHouseNumber(streetId, "7");
  db.prepare("UPDATE house_numbers SET building_type = 'EFH' WHERE id = ?").run(houseId);
  const sale = recordVisit(member, { streetId, territoryId, houseNumber: "7", outcome: "SALE", energyType: "STROM" }).id as number;
  db.prepare("UPDATE visits SET created_at = '2025-03-12 10:15:00' WHERE id = ?").run(sale);

  // Neue Mieter: die Tuer laesst sich wieder erfassen - auch mehrmals.
  recordVisit(member, { streetId, territoryId, houseNumber: "7", outcome: "NOT_HOME" });
  recordVisit(member, { streetId, territoryId, houseNumber: "7", outcome: "NOT_HOME" });
  const reason = db.prepare("SELECT id, label FROM rejection_reasons WHERE team_id = ? LIMIT 1").get(team) as
    | { id: number; label: string }
    | undefined;
  recordVisit(member, { streetId, territoryId, houseNumber: "7", outcome: "MET_NO_SALE", reasonId: reason?.id ?? null });

  const [house] = listHouseNumbers([streetId]).filter((row) => row.id === houseId);
  assert.equal(house.blocked_at, null);
  assert.equal(house.sale_count, 1);
  assert.equal(house.last_sale_at, "2025-03-12 10:15:00");
  assert.equal(house.last_outcome, "MET_NO_SALE");
  assert.equal(house.last_reason_label, reason?.label ?? null);

  const text = doorText(house, doorLast(house, null, () => null), house.last_sale_at, null);
  assert.equal(text.title, reason?.label ?? "Kein Abschluss");
  // Der fruehere Abschluss steht mit vollem Datum in der Zeile.
  assert.match(text.meta, /^Abschluss am 12\.03\.2025 · Alex · /);
});

test("not-home attempts are counted, never capped", () => {
  const houseId = ensureHouseNumber(streetId, "9");
  db.prepare("UPDATE house_numbers SET building_type = 'EFH' WHERE id = ?").run(houseId);
  for (let i = 0; i < 4; i++) recordVisit(member, { streetId, territoryId, houseNumber: "9", outcome: "NOT_HOME" });
  const [house] = listHouseNumbers([streetId]).filter((row) => row.id === houseId);
  assert.equal(house.not_home_count, 4);
  assert.equal(doorOpen(house), true);
  assert.equal(doorText(house, doorLast(house, null, () => null), null, null).title, "Nicht angetroffen · 4×");
});

test("a bell stays open after any number of not-home visits, and shows its own sale", () => {
  const houseId = ensureHouseNumber(streetId, "11");
  db.prepare("UPDATE house_numbers SET building_type = 'MFH' WHERE id = ?").run(houseId);
  const mueller = ensureDoorbell(houseId, "Müller", "2. OG");
  const kaya = ensureDoorbell(houseId, "Kaya", "EG");
  for (let i = 0; i < 3; i++) {
    recordVisit(member, { streetId, territoryId, houseNumber: "11", doorbellLabel: "Müller", outcome: "NOT_HOME" });
  }
  recordVisit(member, { streetId, territoryId, houseNumber: "11", doorbellLabel: "Kaya", outcome: "SALE", energyType: "GAS" });

  const bells = new Map(listDoorbells([houseId]).map((bell) => [bell.id, bell]));
  assert.equal(doorOpen(bells.get(mueller)!), true);
  assert.equal(bells.get(mueller)!.last_sale_at, null);
  assert.equal(doorOpen(bells.get(kaya)!), false);
  assert.notEqual(bells.get(kaya)!.last_sale_at, null);

  // Fortschritt im Gebiet: Mueller (dreimal nicht da) zaehlt nicht als bearbeitet.
  const [house] = listHouseNumbers([streetId]).filter((row) => row.id === houseId);
  assert.equal(house.bell_count, 2);
  assert.equal(house.bell_done_count, 1);
  assert.notEqual(house.last_sale_at, null);
  assert.ok((getTerritory(territoryId, team)?.house_touched_count ?? 0) >= 2);
});

test("a door recorded on the device shows its result before the server knows it", () => {
  const local = { outcome: "APPOINTMENT" as const, reasonLabel: null, reasonIcon: null, at: "2026-10-26 09:00:00", userId: 5 };
  const last = doorLast(NO_VISIT, local, (id) => (id === 5 ? "Kim Weber" : null));
  assert.equal(last.outcome, "APPOINTMENT");
  assert.equal(last.userName, "Kim Weber");
  const text = doorText({ blocked_at: null, not_home_count: 0, met_count: 1 }, last, null, null);
  assert.equal(text.title, "Termin vereinbart");
  assert.match(text.meta, /^Kim · /);
});

test("sale dates read as today, yesterday or a full date", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  assert.match(dayLabel("2026-10-26 08:30:00", now), /^heute \d\d:\d\d$/);
  assert.match(dayLabel("2026-10-25 08:30:00", now), /^gestern \d\d:\d\d$/);
  assert.equal(dayLabel("2024-02-03 08:30:00", now), "03.02.2024");
  assert.equal(saleText("2024-02-03 08:30:00"), "Abschluss am 03.02.2024");
  // Wer/wann in der Zeile: aus einem anderen Jahr mit Jahr, sonst saehe es aus wie von diesem.
  assert.equal(whenLabel("2024-02-03 08:30:00"), "03.02.2024");
});
