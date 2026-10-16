import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { changeSaleDraft, listSaleDrafts } from "../../src/lib/sale-drafts";
import { recordVisit, recordedAtFrom } from "../../src/lib/record-visit";
import { recordTerritoryHandover } from "../../src/lib/territory-handover";
import { countAppointments, listAppointments } from "../../src/lib/queries";
import { getLevelDashboard } from "../../src/lib/level-queries";
import { berlinSlot } from "../../src/lib/format";
import type { Territory, User } from "../../src/lib/types";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-handover-"));
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

let sequence = 0;
function fixture() {
  const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Uebergabe')").run().lastInsertRowid);
  const person = (role: string) => {
    const name = `handover-${++sequence}`;
    const id = Number(
      db.prepare("INSERT INTO users(team_id, name, email, password_hash, role) VALUES (?, ?, ?, '', ?)")
        .run(team, name, `${name}@example.test`, role).lastInsertRowid,
    );
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
  };
  const leader = person("LEADER");
  const first = person("MEMBER");
  const second = person("MEMBER");
  const territoryId = Number(
    db.prepare("INSERT INTO territories(team_id, name, assigned_user_id) VALUES (?, 'Nord', ?)").run(team, first.id).lastInsertRowid,
  );
  const streetId = Number(db.prepare("INSERT INTO streets(territory_id, name) VALUES (?, 'Lindenweg')").run(territoryId).lastInsertRowid);
  const territory = () => db.prepare("SELECT * FROM territories WHERE id = ?").get(territoryId) as Territory;
  // Wie PATCH /api/territories/[id]: Uebergabe festhalten, dann neu zuteilen.
  const handOver = (policy: "KEEP" | "TRANSFER") => {
    recordTerritoryHandover(leader, territory(), second.id, policy, "");
    db.prepare("UPDATE territories SET assigned_user_id = ? WHERE id = ?").run(second.id, territoryId);
  };
  return { team, leader, first, second, territoryId, streetId, territory, handOver };
}
const key = () => `request-${++sequence}-${"x".repeat(8)}`;

test("a sale started before a handover can still be confirmed - and survives a deleted territory", () => {
  const f = fixture();
  const open = { streetId: f.streetId, territoryId: f.territoryId, houseNumber: "7", energyType: "GAS", draftKey: key(), action: "OPEN" };
  changeSaleDraft(f.first, open);
  f.handOver("KEEP");
  const confirmed = changeSaleDraft(f.first, { draftKey: open.draftKey, action: "CONFIRM" });
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(listSaleDrafts(f.first).length, 0);

  // Gebiet geloescht, waehrend der Kunde im Tarifrechner unterschreibt.
  const later = { ...open, houseNumber: "9", draftKey: key() };
  const g = fixture();
  changeSaleDraft(g.first, { ...later, streetId: g.streetId, territoryId: g.territoryId });
  db.prepare("DELETE FROM territories WHERE id = ?").run(g.territoryId);
  const kept = changeSaleDraft(g.first, { draftKey: later.draftKey, action: "CONFIRM" });
  assert.equal(kept.status, "CONFIRMED");
  const visit = db.prepare("SELECT outcome, street_id, territory_id, house_number FROM visits WHERE id = ?").get(kept.id) as Record<string, unknown>;
  assert.deepEqual(visit, { outcome: "SALE", street_id: null, territory_id: null, house_number: "9" });
});

test("with 'Termine bleiben' the old owner can still work their appointment door - only that door", () => {
  const f = fixture();
  recordVisit(f.first, {
    streetId: f.streetId, territoryId: f.territoryId, houseNumber: "12 a", outcome: "APPOINTMENT",
    followUpAt: "2026-12-01 18:00", clientRequestId: key(),
  });
  f.handOver("KEEP");

  const sale = recordVisit(f.first, { streetId: f.streetId, territoryId: f.territoryId, houseNumber: "12A", outcome: "SALE", energyType: "STROM", clientRequestId: key() });
  assert.ok(sale.id);
  assert.throws(
    () => recordVisit(f.first, { streetId: f.streetId, territoryId: f.territoryId, houseNumber: "14", outcome: "NOT_HOME", clientRequestId: key() }),
    /nicht freigegeben/,
  );
  // Auch ein Auftrag laesst sich dort beginnen.
  const open = { streetId: f.streetId, territoryId: f.territoryId, houseNumber: "12a", energyType: "STROM", draftKey: key(), action: "OPEN" };
  assert.equal(changeSaleDraft(f.first, open).status, "OPEN");
});

test("appointment lists put today and upcoming first, then the newest overdue; counts are real", () => {
  const f = fixture();
  const today = berlinSlot().slice(0, 10);
  const book = (slot: string) =>
    recordVisit(f.first, { streetId: f.streetId, territoryId: f.territoryId, houseNumber: String(++sequence), outcome: "APPOINTMENT", followUpAt: slot, clientRequestId: key() }).id as number;
  const old = book("2026-01-05 10:00");
  const older = book("2025-12-01 10:00");
  const recent = book("2026-09-30 10:00");
  const now = book(`${today} 23:59`);
  const future = book("2027-02-01 09:00");

  assert.deepEqual(listAppointments(f.team, { userId: f.first.id }).map((row) => row.id), [now, future, recent, old, older]);
  assert.deepEqual(listAppointments(f.team, { userId: f.first.id, limit: 3 }).map((row) => row.id), [now, future, recent]);
  assert.deepEqual(listAppointments(f.team, { userId: f.first.id, before: today, limit: 2 }).map((row) => row.id), [recent, old]);
  assert.deepEqual(listAppointments(f.team, { userId: f.first.id, from: today }).map((row) => row.id), [now, future]);

  db.prepare("UPDATE visits SET follow_up_done_at = datetime('now') WHERE id = ?").run(older);
  assert.deepEqual(countAppointments(f.team, { userId: f.first.id }), { open: 4, overdue: 2, done: 1 });
  assert.deepEqual(countAppointments(f.team), { open: 4, overdue: 2, done: 1 });
});

test("completed appointments count for whoever owns them after a transfer", () => {
  const f = fixture();
  const id = recordVisit(f.first, {
    streetId: f.streetId, territoryId: f.territoryId, houseNumber: "3", outcome: "APPOINTMENT", followUpAt: "2026-11-02 17:00", clientRequestId: key(),
  }).id as number;
  f.handOver("TRANSFER");
  db.prepare("UPDATE visits SET follow_up_done_at = datetime('now') WHERE id = ?").run(id);
  const stat = (user: User) =>
    getLevelDashboard(f.team, user.id).achievements.find((a) => a.kind === "completedAppointments")?.current ?? null;
  assert.equal(stat(f.second), 1);
  assert.equal(stat(f.first), 0);
});

test("doors recorded without signal count for the moment at the door, undo counts from arrival", () => {
  const now = Date.parse("2026-10-16T08:30:00Z");
  assert.equal(recordedAtFrom("2026-10-15T17:40:00.000Z", now), "2026-10-15 17:40:00");
  assert.equal(recordedAtFrom("2026-10-16T08:29:50.000Z", now), null, "gerade eben: Serverzeit");
  assert.equal(recordedAtFrom("2026-10-10T08:00:00.000Z", now), null, "aelter als drei Tage");
  assert.equal(recordedAtFrom("2026-10-16T09:30:00.000Z", now), null, "Uhr geht vor");
  assert.equal(recordedAtFrom("gestern", now), null);

  const f = fixture();
  const at = new Date(Date.now() - 5 * 3_600_000).toISOString();
  const saved = recordVisit(f.first, { streetId: f.streetId, territoryId: f.territoryId, houseNumber: "1", outcome: "SALE", energyType: "GAS", recordedAt: at, clientRequestId: key() });
  const row = db.prepare("SELECT created_at, received_at FROM visits WHERE id = ?").get(saved.id) as { created_at: string; received_at: string | null };
  assert.equal(row.created_at, at.slice(0, 19).replace("T", " "));
  assert.ok(row.received_at && row.received_at > row.created_at);
  const post = db.prepare("SELECT created_at FROM posts WHERE visit_id = ?").get(saved.id) as { created_at: string };
  assert.equal(post.created_at, row.created_at);
});

test("in an apartment building the kept appointment opens only its own bell, also after a rename", () => {
  const f = fixture();
  recordVisit(f.first, {
    streetId: f.streetId, territoryId: f.territoryId, houseNumber: "20", doorbellLabel: "Klingel 2",
    outcome: "APPOINTMENT", followUpAt: "2026-12-03 18:00", clientRequestId: key(),
  });
  db.prepare("UPDATE doorbells SET label = 'Müller' WHERE label = 'Klingel 2'").run();
  f.handOver("KEEP");
  const at = (doorbellLabel: string) => () =>
    recordVisit(f.first, { streetId: f.streetId, territoryId: f.territoryId, houseNumber: "20", doorbellLabel, outcome: "NOT_HOME", clientRequestId: key() });
  assert.doesNotThrow(at("Müller"));
  assert.throws(at("Klingel 5"), /nicht freigegeben/);
  assert.throws(at(""), /nicht freigegeben/);
});

test("a door recorded without signal is never dated before the last door saved online", () => {
  const f = fixture();
  const live = recordVisit(f.first, { streetId: f.streetId, territoryId: f.territoryId, houseNumber: "30", outcome: "NOT_HOME", clientRequestId: key() });
  const liveAt = (db.prepare("SELECT created_at FROM visits WHERE id = ?").get(live.id) as { created_at: string }).created_at;
  const backdated = recordVisit(f.first, {
    streetId: f.streetId, territoryId: f.territoryId, houseNumber: "31", outcome: "SALE", energyType: "GAS",
    recordedAt: new Date(Date.now() - 48 * 3_600_000).toISOString(), clientRequestId: key(),
  });
  const row = db.prepare("SELECT created_at FROM visits WHERE id = ?").get(backdated.id) as { created_at: string };
  assert.equal(row.created_at >= liveAt, true);
});

test("open appointments: what is still coming first, then the most recently passed", () => {
  const f = fixture();
  const book = (slot: string) =>
    recordVisit(f.first, { streetId: f.streetId, territoryId: f.territoryId, houseNumber: String(++sequence), outcome: "APPOINTMENT", followUpAt: slot, clientRequestId: key() }).id as number;
  const morning = book("2026-10-16 08:00");
  const noon = book("2026-10-16 12:00");
  const evening = book("2026-10-16 18:00");
  const yesterday = book("2026-10-15 17:00");
  const now = new Date("2026-10-16T13:30:00Z"); // 15:30 in Berlin
  assert.deepEqual(listAppointments(f.team, { userId: f.first.id, now }).map((row) => row.id), [evening, noon, morning, yesterday]);
});
