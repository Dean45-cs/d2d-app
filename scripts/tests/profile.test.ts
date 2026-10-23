import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { profileCounts } from "../../src/lib/queries";
import {
  addProfiles,
  EMPTY_PROFILE,
  MAX_CHANGE,
  PROFILE_AXES,
  profileChange,
  profilePoints,
  type ProfileCounts,
} from "../../src/lib/profile";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-profile-"));
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

const counts = (values: Partial<ProfileCounts>): ProfileCounts => ({ ...EMPTY_PROFILE, ...values });
const axis = (key: string) => PROFILE_AXES.find((a) => a.key === key)!;

test("rates need the same minimum as the ranking before they say anything", () => {
  assert.equal(axis("meet").value(counts({ doors: 19, met: 10 })), null);
  assert.equal(axis("meet").value(counts({ doors: 20, met: 5 })), 25);
  assert.equal(axis("close").value(counts({ met: 4, sales: 4 })), null);
  assert.equal(axis("close").value(counts({ met: 5, sales: 1 })), 20);
  assert.equal(axis("combo").value(counts({ knownSales: 2, comboSales: 2 })), null);
  assert.equal(axis("follow_up").value(counts({ dueAppointments: 4, doneAppointments: 3 })), 75);
  // Fleiß je Arbeitstag: freie Tage drücken den Wert nicht.
  assert.equal(axis("pace").value(counts({ doors: 90, days: 3 })), 30);
  assert.equal(axis("pace").format(30), "30 / Tag");
  assert.equal(axis("meet").basis(counts({ doors: 35, met: 12 })), "12 von 35 Türen");
});

test("each axis is measured against the period before; the rim is double", () => {
  assert.equal(profileChange(30, 30), 1);
  assert.equal(profileChange(15, 30), 0.5);
  assert.equal(profileChange(90, 30), MAX_CHANGE);
  assert.equal(profileChange(0, 0), 1);
  assert.equal(profileChange(5, 0), MAX_CHANGE);
  assert.equal(profileChange(0, 20), 0);
  assert.equal(profileChange(null, 20), null);
  assert.equal(profileChange(20, null), null);

  const now = counts({ doors: 40, met: 20, sales: 4, days: 2 });
  const before = counts({ doors: 40, met: 10, sales: 1, days: 2 });
  const points = profilePoints(now, before);
  assert.deepEqual(
    points.map((p) => [p.axis.key, p.change]),
    [
      ["pace", 1],
      ["meet", MAX_CHANGE],
      ["appointment", 1],
      ["close", MAX_CHANGE],
      ["combo", null],
      ["follow_up", null],
    ],
  );
  // Ohne Zeitraum davor ("Gesamt") gibt es Werte, aber keinen Vergleich.
  assert.ok(profilePoints(now, null).every((p) => p.change === null));
});

test("team profile adds people up - working days become person-days", () => {
  const sum = addProfiles([counts({ doors: 30, days: 1 }), counts({ doors: 50, days: 2 })]);
  assert.equal(sum.doors, 80);
  assert.equal(sum.days, 3);
  assert.equal(addProfiles([]).doors, 0);
});

test("counts per person: Berlin days, combo sales and due appointments for their owner", () => {
  const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Profil')").run().lastInsertRowid);
  const person = (name: string) =>
    Number(
      db
        .prepare("INSERT INTO users(team_id, name, email, password_hash, role) VALUES (?, ?, ?, '', 'MEMBER')")
        .run(team, name, `${name}@profile.test`).lastInsertRowid,
    );
  const anna = person("anna");
  const ben = person("ben");
  const visit = (
    user: number,
    outcome: string,
    created: string,
    extra: { energy?: string; slot?: string; done?: string; owner?: number } = {},
  ) =>
    db
      .prepare(
        `INSERT INTO visits(team_id, user_id, outcome, energy_type, follow_up_at, follow_up_done_at, follow_up_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(team, user, outcome, extra.energy ?? "", extra.slot ?? null, extra.done ?? null, extra.owner ?? null, created);

  // 20:00 und 22:30 UTC liegen im Oktober (Sommerzeit) auf zwei Berliner Tagen -
  // nach UTC gezählt wären es mit dem 2. und 7. nur drei statt vier.
  visit(anna, "NOT_HOME", "2026-10-05 08:00:00");
  visit(anna, "SALE", "2026-10-05 20:00:00", { energy: "BEIDES" });
  visit(anna, "SALE", "2026-10-05 22:30:00", { energy: "STROM" });
  visit(anna, "SALE", "2026-10-07 09:00:00");
  visit(anna, "MET_NO_SALE", "2026-10-07 10:00:00");
  // Termine: einer erledigt, einer offen, einer erst morgen, einer an Ben übergeben.
  visit(anna, "APPOINTMENT", "2026-10-02 17:00:00", { slot: "2026-10-06 18:00", done: "2026-10-06 18:30:00" });
  visit(anna, "APPOINTMENT", "2026-10-02 17:10:00", { slot: "2026-10-08 18:00" });
  visit(anna, "APPOINTMENT", "2026-10-02 17:20:00", { slot: "2026-10-11 18:00" });
  visit(anna, "APPOINTMENT", "2026-10-02 17:30:00", { slot: "2026-10-09 18:00", owner: ben });
  // Vor dem Zeitraum - zählt nicht mit.
  visit(ben, "SALE", "2026-09-20 10:00:00", { energy: "GAS" });

  const now = new Date("2026-10-10T12:00:00Z");
  // Berliner Mitternacht des 1. Oktober in UTC.
  const since = "2026-09-30 22:00:00";
  const byUser = profileCounts(team, { since, now });

  assert.deepEqual(byUser.get(anna), {
    doors: 9,
    met: 8,
    appointments: 4,
    sales: 3,
    days: 4,
    knownSales: 2,
    comboSales: 1,
    dueAppointments: 2,
    doneAppointments: 1,
  });
  assert.deepEqual(byUser.get(ben), { ...EMPTY_PROFILE, dueAppointments: 1 });

  // Eine Person allein: dieselben Zahlen, nur ihre.
  const own = profileCounts(team, { userId: anna, since, now });
  assert.deepEqual([...own.keys()], [anna]);
  assert.deepEqual(own.get(anna), byUser.get(anna));

  // Zeitraum davor: endet am Anfang des aktuellen - auch für die Termine.
  const earlier = profileCounts(team, { since: "2026-09-01 00:00:00", until: since, now });
  assert.equal(earlier.get(ben)?.sales, 1);
  assert.equal(earlier.get(anna), undefined);
});
