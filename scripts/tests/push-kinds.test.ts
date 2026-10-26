import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { pushKinds, setPushKinds } from "../../src/lib/push";
import { recordVisit } from "../../src/lib/record-visit";
import { sendAppointmentReminders } from "../../src/lib/appointment-reminders";
import type { User } from "../../src/lib/types";

/* Push-Arten (Einstellungen -> Mitteilungen): je Person abbestellbar, fuer alle Geraete. */

const directory = mkdtempSync(path.join(tmpdir(), "d2d-push-kinds-"));
const previous = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = path.join(directory, "test.db");
const db = getDb();
after(() => {
  db.close(); global.__d2dDb = undefined;
  if (previous === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previous;
  rmSync(directory, { recursive: true, force: true });
});

function person(team: number, name: string): User {
  const id = Number(db.prepare("INSERT INTO users(team_id, name, email, password_hash, role) VALUES (?, ?, ?, '', 'MEMBER')")
    .run(team, name, `${name}@example.test`).lastInsertRowid);
  db.prepare("INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth) VALUES (?, ?, 'unused', 'unused')")
    .run(id, `https://fcm.googleapis.com/test-${id}`);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
}

test("alles ist an, bis jemand etwas abbestellt - und das bleibt fuer genau diese Art", () => {
  const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Push')").run().lastInsertRowid);
  const user = person(team, "push-one");
  assert.deepEqual(pushKinds(user.id), { sale: true, comment: true, follow: true, reminder: true });
  assert.deepEqual(setPushKinds(user.id, { comment: false, follow: false }), { sale: true, comment: false, follow: false, reminder: true });
  assert.deepEqual(setPushKinds(user.id, { follow: true }), { sale: true, comment: false, follow: true, reminder: true });
  assert.equal((db.prepare("SELECT push_off FROM users WHERE id = ?").get(user.id) as { push_off: string }).push_off, "comment");
});

test("abbestellte Terminerinnerungen kommen nicht - die anderen schon", async () => {
  const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Erinnerung')").run().lastInsertRowid);
  const quiet = person(team, "push-quiet");
  const loud = person(team, "push-loud");
  for (const [user, key] of [[quiet, "a"], [loud, "b"]] as const) {
    const territory = Number(db.prepare("INSERT INTO territories(team_id, name, assigned_user_id) VALUES (?, 'Nord', ?)")
      .run(team, user.id).lastInsertRowid);
    const street = Number(db.prepare("INSERT INTO streets(territory_id, name) VALUES (?, 'Weg')").run(territory).lastInsertRowid);
    recordVisit(user, {
      streetId: street, territoryId: territory, houseNumber: "1", doorbellLabel: "", energyType: "STROM",
      outcome: "APPOINTMENT", followUpAt: "2026-10-12 18:00", followUpTimeZone: "Europe/Berlin", clientRequestId: `reminder-${key}`,
    });
  }
  setPushKinds(quiet.id, { reminder: false });
  const sent: number[][] = [];
  const delivered = await sendAppointmentReminders(new Date("2026-10-12T15:50:00Z"), async (users) => {
    sent.push(users);
    return 1;
  });
  assert.equal(delivered, 1);
  assert.deepEqual(sent, [[loud.id]]);
});
