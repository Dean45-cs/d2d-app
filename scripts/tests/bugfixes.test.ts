import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth";
import { berlinMidnight } from "../../src/lib/format";
import { previousRange, rangeToSince } from "../../src/lib/ranges";
import { requireTeamPerson } from "../../src/lib/community";
import { createInvitation, registerInvitation, rejectPendingJoins } from "../../src/lib/invitations";
import { recordVisit } from "../../src/lib/record-visit";
import {
  addStreets,
  ensureHouseNumber,
  getTerritory,
  listAppointments,
  listHouseNumbers,
  reasonCode,
  setAppointmentDone,
} from "../../src/lib/queries";
import type { User } from "../../src/lib/types";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-bugfixes-"));
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

const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Fixes')").run().lastInsertRowid);
let sequence = 0;
function person(role: "LEADER" | "MEMBER", managerId: number | null = null): User {
  const name = `fix-${++sequence}`;
  const id = Number(
    db.prepare("INSERT INTO users(team_id, manager_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)")
      .run(team, managerId, name, `${name}@example.test`, hashPassword("password123"), role).lastInsertRowid,
  );
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
}
const leader = person("LEADER");
const member = person("MEMBER", leader.id);
const territoryId = Number(
  db.prepare("INSERT INTO territories(team_id, name, assigned_user_id) VALUES (?, 'Nord', ?)").run(team, member.id).lastInsertRowid,
);
const streetId = Number(db.prepare("INSERT INTO streets(territory_id, name) VALUES (?, 'Hauptstraße')").run(territoryId).lastInsertRowid);

test("'today' starts at midnight in Berlin, also right after midnight and across DST", () => {
  // 00:30 in Berlin (Sommerzeit) ist noch 22:30 UTC des Vortags.
  const afterMidnight = new Date("2026-10-14T22:30:00Z");
  assert.equal(berlinMidnight(0, afterMidnight), "2026-10-14 22:00:00");
  assert.equal(rangeToSince("1", afterMidnight), "2026-10-14 22:00:00");
  assert.deepEqual(previousRange("1", afterMidnight), { since: "2026-10-13 22:00:00", until: "2026-10-14 22:00:00" });

  // Der 25. Oktober 2026 hat 25 Stunden: gezaehlt wird im Kalender.
  const lateOnLongDay = new Date("2026-10-25T22:30:00Z"); // 23:30 MEZ
  assert.equal(rangeToSince("1", lateOnLongDay), "2026-10-24 22:00:00");
  assert.equal(rangeToSince("7", lateOnLongDay), "2026-10-18 22:00:00");
  assert.deepEqual(previousRange("7", lateOnLongDay), { since: "2026-10-11 22:00:00", until: "2026-10-18 22:00:00" });
  assert.equal(rangeToSince("all", lateOnLongDay), undefined);
  assert.equal(previousRange("all", lateOnLongDay), null);
});

test("hand-typed house numbers with spaces still count their visits", () => {
  const houseId = ensureHouseNumber(streetId, "12 A");
  db.prepare("UPDATE house_numbers SET building_type = 'EFH' WHERE id = ?").run(houseId);
  recordVisit(member, { streetId, territoryId, houseNumber: "12 A", outcome: "MET_NO_SALE" });

  const [house] = listHouseNumbers([streetId]).filter((row) => row.id === houseId);
  assert.equal(house.visit_count, 1);
  assert.equal(house.met_count, 1);
  assert.equal(getTerritory(territoryId, team)?.house_touched_count, 1);
});

test("pasted street lists skip empty names and streets the territory already has", () => {
  const added = addStreets(territoryId, "Hauptstraße 1-9\nGartenweg; 12 WE\ngartenweg\n; 30 WE\n");
  assert.equal(added, 1);
  const names = (db.prepare("SELECT name FROM streets WHERE territory_id = ? ORDER BY id").all(territoryId) as Array<{ name: string }>)
    .map((row) => row.name);
  assert.deepEqual(names, ["Hauptstraße", "Gartenweg"]);
  assert.equal(addStreets(territoryId, "Gartenweg"), 0);
});

test("done appointments never push open ones out of the list limit", () => {
  const book = (day: string) =>
    recordVisit(member, {
      streetId,
      territoryId,
      houseNumber: "3",
      outcome: "APPOINTMENT",
      followUpAt: `2026-11-${day} 18:00`,
    }).id as number;
  const old = [book("01"), book("02"), book("03")];
  const upcoming = book("20");
  for (const id of old) setAppointmentDone(id, true);

  assert.deepEqual(listAppointments(team, { userId: member.id, limit: 2 }).map((row) => row.id), [upcoming]);
  // Erledigte: die juengsten zuerst.
  assert.deepEqual(listAppointments(team, { userId: member.id, done: true, limit: 2 }).map((row) => row.id), [old[2], old[1]]);
});

test("the appointment route leads to the house, not to where the visit was typed in", () => {
  const houseId = ensureHouseNumber(streetId, "40");
  db.prepare("UPDATE house_numbers SET lat = 51.5, lng = 7.4 WHERE id = ?").run(houseId);
  const located = recordVisit(member, {
    streetId, territoryId, houseNumber: "40", outcome: "APPOINTMENT", followUpAt: "2026-12-01 18:00", lat: 50.1, lng: 8.6,
  }).id as number;
  const unknown = recordVisit(member, {
    streetId, territoryId, houseNumber: "41", outcome: "APPOINTMENT", followUpAt: "2026-12-02 18:00", lat: 50.1, lng: 8.6,
  }).id as number;
  const rows = new Map(listAppointments(team, { userId: member.id }).map((row) => [row.id, row]));
  assert.deepEqual([rows.get(located)?.lat, rows.get(located)?.lng], [51.5, 7.4]);
  // Ohne Lage des Hauses bleibt es beim erfassten Punkt.
  assert.deepEqual([rows.get(unknown)?.lat, rows.get(unknown)?.lng], [50.1, 8.6]);
});

test("reason codes stay unique even after reordering lowered the highest sort order", () => {
  db.prepare("INSERT INTO rejection_reasons(team_id, code, label, sort_order) VALUES (?, 'TEST_14', 'Test', 13.5)").run(team);
  assert.equal(reasonCode(team, "Test", "", 14), "TEST_15");
  assert.equal(reasonCode(team, "Neu", "", 14), "NEU_14");
  assert.equal(reasonCode(team, "Egal", "eigen", 14), "EIGEN");
  assert.throws(() => reasonCode(team, "Egal", "test_14", 14), /gibt es schon/);
});

test("deactivating an inviter releases their pending join requests", () => {
  const inviter = person("MEMBER", leader.id);
  const { token } = createInvitation(inviter.id);
  registerInvitation(token, { name: "Neu", email: "neu@example.test", password: "password123" });
  db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(inviter.id);
  assert.equal(rejectPendingJoins(leader.id, inviter.id), 1);

  const request = db.prepare("SELECT status, decided_by, password_hash FROM join_requests WHERE lower(email) = 'neu@example.test'").get() as {
    status: string;
    decided_by: number;
    password_hash: string | null;
  };
  assert.deepEqual(request, { status: "REJECTED", decided_by: leader.id, password_hash: null });

  // Die E-Mail ist wieder frei fuer eine neue Einladung.
  const again = createInvitation(member.id);
  assert.deepEqual(registerInvitation(again.token, { name: "Neu", email: "neu@example.test", password: "password123" }), { ok: true });
});

test("profiles of deactivated people stay listable, follows still need an active person", () => {
  const gone = person("MEMBER", leader.id);
  db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(gone.id);
  assert.throws(() => requireTeamPerson(gone.id, team), /nicht gefunden/);
  assert.equal(requireTeamPerson(gone.id, team, { includeInactive: true }).id, gone.id);
});
