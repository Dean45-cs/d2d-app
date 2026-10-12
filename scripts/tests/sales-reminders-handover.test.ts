import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { changeSaleDraft, listSaleDrafts } from "../../src/lib/sale-drafts";
import { recordVisit } from "../../src/lib/record-visit";
import { getLevelProgress } from "../../src/lib/level-queries";
import { listAppointments, requireTeamVisit, setAppointmentDone, setAppointmentSlot } from "../../src/lib/queries";
import { appointmentTimeZone, appointmentUtc } from "../../src/lib/appointment-time";
import { sendAppointmentReminders } from "../../src/lib/appointment-reminders";
import { handoverSummary, recordTerritoryHandover } from "../../src/lib/territory-handover";
import type { Territory, User } from "../../src/lib/types";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-workflows-"));
const previous = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = path.join(directory, "test.db");
const db = getDb();
after(() => {
  db.close(); global.__d2dDb = undefined;
  if (previous === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previous;
  rmSync(directory, { recursive: true, force: true });
});
let sequence = 0;
function fixture() {
  const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Workflows')").run().lastInsertRowid);
  const person = (role: string) => {
    const name = `workflow-${++sequence}`;
    const id = Number(db.prepare("INSERT INTO users(team_id, name, email, password_hash, role) VALUES (?, ?, ?, '', ?)")
      .run(team, name, `${name}@example.test`, role).lastInsertRowid);
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
  };
  const leader = person("LEADER"), first = person("MEMBER"), second = person("MEMBER");
  const territoryId = Number(db.prepare("INSERT INTO territories(team_id, name, assigned_user_id, note) VALUES (?, 'West', ?, 'Hofeingang nutzen')")
    .run(team, first.id).lastInsertRowid);
  const territory = db.prepare("SELECT * FROM territories WHERE id = ?").get(territoryId) as Territory;
  const streetId = Number(db.prepare("INSERT INTO streets(territory_id, name) VALUES (?, 'Teststraße')").run(territoryId).lastInsertRowid);
  const payload = { streetId, territoryId, houseNumber: "12", doorbellLabel: "", energyType: "STROM" };
  const opening = (draftKey = `sale-draft-${++sequence}`) => ({ ...payload, draftKey, action: "OPEN" });
  const appointment = (slot = "2026-10-12 18:00", zone = "Europe/Berlin") => recordVisit(first,
    { ...payload, outcome: "APPOINTMENT", followUpAt: slot, followUpTimeZone: zone, clientRequestId: `appointment-${++sequence}` });
  return { team, leader, first, second, territory, streetId, payload, opening, appointment };
}
const count = (table: string, user: User) => (db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id = ?`).get(user.id) as { total: number }).total;

test("opening a calculator earns no visit, XP or sale post; confirmation earns exactly once", () => {
  const f = fixture(); const open = f.opening();
  changeSaleDraft(f.first, open);
  changeSaleDraft(f.first, open);
  assert.equal(listSaleDrafts(f.first).length, 1);
  assert.equal(count("visits", f.first), 0);
  assert.equal(count("posts", f.first), 0);
  assert.equal(getLevelProgress(f.team, f.first.id).totalXp, 0);
  const confirmed = changeSaleDraft(f.first, { draftKey: open.draftKey, action: "CONFIRM" });
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(count("visits", f.first), 1);
  assert.equal(count("posts", f.first), 1);
  assert.equal(getLevelProgress(f.team, f.first.id).totalXp, 100);
  assert.equal(changeSaleDraft(f.first, { draftKey: open.draftKey, action: "CONFIRM" }).replayed, true);
  assert.equal(count("visits", f.first), 1);
  assert.equal(listSaleDrafts(f.first).length, 0);
  assert.throws(() => changeSaleDraft(f.first, { draftKey: open.draftKey, action: "ABORT" }));
  // A delayed opening cannot resurrect a closed draft, including after undo.
  const row = db.prepare("SELECT id FROM visits WHERE user_id = ?").get(f.first.id) as { id: number };
  db.prepare("DELETE FROM visits WHERE id = ?").run(row.id);
  changeSaleDraft(f.first, open);
  changeSaleDraft(f.first, { draftKey: open.draftKey, action: "CONFIRM" });
  assert.equal(count("visits", f.first), 0);
  assert.equal(count("posts", f.first), 0);
});

test("aborted and foreign drafts cannot become a sale; current door blocks apply on confirmation", () => {
  const f = fixture(); const open = f.opening();
  changeSaleDraft(f.first, open);
  assert.equal(listSaleDrafts(f.second).length, 0);
  assert.throws(() => changeSaleDraft(f.second, { draftKey: open.draftKey, action: "CONFIRM" }));
  assert.throws(() => changeSaleDraft(f.first, { ...open, ownerUserId: f.second.id }));
  changeSaleDraft(f.first, { draftKey: open.draftKey, action: "ABORT" });
  assert.throws(() => changeSaleDraft(f.first, { draftKey: open.draftKey, action: "CONFIRM" }));
  assert.equal(count("visits", f.first), 0);
  const blocked = f.opening(); changeSaleDraft(f.first, blocked);
  db.prepare("UPDATE house_numbers SET blocked_at = datetime('now') WHERE street_id = ?").run(f.streetId);
  assert.throws(() => changeSaleDraft(f.first, { draftKey: blocked.draftKey, action: "CONFIRM" }), /gesperrt/);
  assert.equal(listSaleDrafts(f.first).length, 1);
  assert.equal(count("posts", f.first), 0);
});

test("a failed sale post rolls back confirmation, leaving the draft retryable", () => {
  const f = fixture(); const open = f.opening(); changeSaleDraft(f.first, open);
  db.exec(`CREATE TEMP TRIGGER fail_confirmation BEFORE INSERT ON posts WHEN NEW.user_id = ${f.first.id}
    BEGIN SELECT RAISE(ABORT, 'post failed'); END`);
  try {
    assert.throws(() => changeSaleDraft(f.first, { draftKey: open.draftKey, action: "CONFIRM" }), /post failed/);
    assert.equal(count("visits", f.first), 0);
    assert.equal(listSaleDrafts(f.first).length, 1);
  } finally { db.exec("DROP TRIGGER fail_confirmation"); }
  changeSaleDraft(f.first, { draftKey: open.draftKey, action: "CONFIRM" });
  assert.equal(count("posts", f.first), 1);
});

test("appointment instants follow the captured zone across DST and reject missing hours", () => {
  assert.equal(appointmentUtc("2026-01-12 18:00", "Europe/Berlin"), "2026-01-12T17:00:00.000Z");
  assert.equal(appointmentUtc("2026-07-12 18:00", "Europe/Berlin"), "2026-07-12T16:00:00.000Z");
  assert.equal(appointmentUtc("2026-07-12 18:00", "America/New_York"), "2026-07-12T22:00:00.000Z");
  assert.throws(() => appointmentUtc("2026-03-29 02:30", "Europe/Berlin"), /Zeitumstellung/);
  assert.throws(() => appointmentTimeZone("Invalid/Zone"));
  const f = fixture();
  assert.throws(() => recordVisit(f.first, { ...f.payload, outcome: "APPOINTMENT" }), /Uhrzeit/);
  const created = f.appointment();
  assert.deepEqual(db.prepare("SELECT follow_up_timezone, follow_up_utc FROM visits WHERE id = ?").get(created.id),
    { follow_up_timezone: "Europe/Berlin", follow_up_utc: "2026-10-12T16:00:00.000Z" });
});

function subscribe(user: User) {
  db.prepare("INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth) VALUES (?, ?, 'unused', 'unused')")
    .run(user.id, `https://fcm.googleapis.com/test-${user.id}`);
}

test("reminders are private, deduplicated, expire at start, and skip completed or past appointments", async () => {
  const f = fixture(); subscribe(f.first);
  const visit = f.appointment();
  const messages: { users: number[]; ttl?: number; body: string; url: string }[] = [];
  const send = async (users: number[], message: { ttl?: number; body: string; url: string }) => { messages.push({ users, ...message }); return 1; };
  assert.equal(await sendAppointmentReminders(new Date("2026-10-12T15:44:00Z"), send), 0);
  assert.equal(await sendAppointmentReminders(new Date("2026-10-12T15:45:00Z"), send), 1);
  assert.deepEqual(messages[0].users, [f.first.id]);
  assert.equal(messages[0].url, `/termine?termin=${visit.id}`);
  assert.equal(messages[0].ttl, 900);
  assert.doesNotMatch(messages[0].body, /Teststraße|12|Hofeingang/);
  assert.equal(await sendAppointmentReminders(new Date("2026-10-12T15:46:00Z"), send), 0);
  setAppointmentSlot(visit.id!, "2026-10-12 19:00");
  setAppointmentDone(visit.id!, true);
  assert.equal(await sendAppointmentReminders(new Date("2026-10-12T16:45:00Z"), send), 0);
  setAppointmentDone(visit.id!, false);
  assert.equal(await sendAppointmentReminders(new Date("2026-10-12T17:00:00Z"), send), 0);
  assert.equal(await sendAppointmentReminders(new Date("2026-10-12T16:45:00Z"), send), 1);
});

test("failed reminders retry and concurrent workers respect DB leases", async () => {
  const f = fixture(); subscribe(f.first); f.appointment("2026-10-13 18:00");
  const start = new Date("2026-10-13T15:45:00Z");
  assert.equal(await sendAppointmentReminders(start, async () => 0), 0);
  assert.equal(await sendAppointmentReminders(new Date(start.getTime() + 30_000), async () => 1), 0);
  let release: (n: number) => void = () => {};
  const pending = sendAppointmentReminders(new Date(start.getTime() + 60_000), () => new Promise<number>((resolve) => { release = resolve; }));
  assert.equal(await sendAppointmentReminders(new Date(start.getTime() + 60_000), async () => { throw new Error("Duplicate"); }), 0);
  release(1);
  assert.equal(await pending, 1);
});

test("territory handover requires explicit appointment ownership and preserves author XP", async () => {
  const f = fixture(); const visit = f.appointment("2026-10-14 18:00");
  const xp = getLevelProgress(f.team, f.first.id).totalXp;
  assert.throws(() => recordTerritoryHandover(f.leader, f.territory, f.second.id, undefined, ""), /festlegen/);
  assert.throws(() => recordTerritoryHandover(f.leader, f.territory, null, "TRANSFER", ""), /Person/);
  assert.throws(() => recordTerritoryHandover(f.first, f.territory, f.second.id, "TRANSFER", ""));
  recordTerritoryHandover(f.leader, f.territory, f.second.id, "KEEP", "Bleibt bei Anna");
  assert.equal(listAppointments(f.team, { userId: f.first.id }).length, 1);
  recordTerritoryHandover(f.leader, f.territory, f.second.id, "TRANSFER", "Neue Verantwortung");
  assert.equal(listAppointments(f.team, { userId: f.first.id }).length, 0);
  assert.equal(listAppointments(f.team, { userId: f.second.id }).length, 1);
  assert.equal(requireTeamVisit(visit.id!, f.team).user_id, f.second.id);
  assert.equal(getLevelProgress(f.team, f.first.id).totalXp, xp);
  assert.equal(getLevelProgress(f.team, f.second.id).totalXp, 0);
  subscribe(f.second);
  const recipients: number[][] = [];
  await sendAppointmentReminders(new Date("2026-10-14T15:45:00Z"), async (ids) => { recipients.push(ids); return 1; });
  assert.deepEqual(recipients, [[f.second.id]]);
  assert.equal(handoverSummary(f.territory).appointments[0].owner_name, f.second.name);
  assert.equal(handoverSummary(f.territory).latest?.appointments_transferred, 1);
});

test("handover summary counts individual bells, parent blocks and previous attempts", () => {
  const f = fixture();
  recordVisit(f.first, { ...f.payload, houseNumber: "1", outcome: "NOT_HOME" });
  recordVisit(f.first, { ...f.payload, houseNumber: "2", doorbellLabel: "Anna", outcome: "NOT_HOME" });
  recordVisit(f.first, { ...f.payload, houseNumber: "2", doorbellLabel: "Bob", outcome: "NOT_HOME" });
  db.prepare("UPDATE house_numbers SET blocked_at = datetime('now'), blocked_note = 'Keine Werbung' WHERE street_id = ? AND number = '2'").run(f.streetId);
  const summary = handoverSummary(f.territory);
  assert.equal(summary.openDoors, 1);
  assert.equal(summary.retryDoors, 1);
  assert.equal(summary.blockedDoors, 2);
  assert.equal(summary.attempts, 3);
  assert.equal(summary.notes, "Hofeingang nutzen");
  assert.equal(summary.details.filter((door) => door.state === "BLOCKED").length, 2);
});
