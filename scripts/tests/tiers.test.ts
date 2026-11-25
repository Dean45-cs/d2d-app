import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { getDb } from "../../src/lib/db";
import { DEFAULT_RANKS, canLeadTeam, isTier, nextTier, normalizeRanks, positionLabel, TIERS, TIER_LABEL } from "../../src/lib/tiers";
import { activeHref, navigation } from "../../src/lib/nav";
import { PERMISSIONS, type PermissionSet } from "../../src/lib/permission-definitions";
import { loadSettings } from "../../src/lib/commissions/store";
import type { User } from "../../src/lib/types";

/* Raenge im Vertrieb: Namen, wer ein Team haben darf, und das Update bestehender Datenbanken. */

const dir = mkdtempSync(path.join(tmpdir(), "d2d-tiers-"));
const previous = process.env.DATABASE_PATH;
after(() => {
  global.__d2dDb?.close(); global.__d2dDb = undefined;
  if (previous === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previous;
  rmSync(dir, { recursive: true, force: true });
});

test("vier Raenge ab Werk - ein Team gibt es ab Junior Teamleiter, Namen und Schalter sind einstellbar", () => {
  assert.deepEqual(TIERS.map((tier) => TIER_LABEL[tier]), ["Berater", "Senior Berater", "Junior Teamleiter", "Teamleiter"]);
  assert.deepEqual(TIERS.map((tier) => canLeadTeam({ role: "MEMBER", tier })), [false, false, true, true]);
  // Die Geschaeftsfuehrung hat immer ein Team - ihr Rang spielt keine Rolle.
  assert.equal(canLeadTeam({ role: "LEADER", tier: "BERATER" }), true);
  assert.equal(positionLabel({ role: "LEADER", tier: "BERATER" }), "Geschäftsführung");
  assert.equal(positionLabel({ role: "MEMBER", tier: "SENIOR" }), "Senior Berater");
  const renamed = { ...DEFAULT_RANKS, SENIOR: { label: "Profi", team: true } };
  assert.equal(positionLabel({ role: "MEMBER", tier: "SENIOR" }, renamed), "Profi");
  assert.equal(canLeadTeam({ role: "MEMBER", tier: "SENIOR" }, renamed), true);
  // Ein Team ist nach oben offen: darf der Senior eines haben, duerfen es alle darueber auch.
  const odd = normalizeRanks({ ...DEFAULT_RANKS, SENIOR: { label: "Senior", team: true }, JUNIOR_LEAD: { label: "Junior", team: false } });
  assert.deepEqual(TIERS.map((tier) => odd[tier].team), [false, true, true, true]);
  assert.deepEqual([nextTier("BERATER"), nextTier("JUNIOR_LEAD"), nextTier("TEAMLEITER")], ["SENIOR", "TEAMLEITER", null]);
  assert.ok(isTier("JUNIOR_LEAD") && isTier("TEAMLEITER") && !isTier("LEADER") && !isTier(null) && !isTier("teamleiter"));
});

test("Navigation: die Karriere steht im Team - fuer alle, und der Reiter Team bleibt markiert", () => {
  const none = Object.fromEntries(PERMISSIONS.map(({ key }) => [key, false])) as PermissionSet;
  const nav = navigation("MEMBER", none, 7);
  const team = nav.sidebar.find((section) => section.title === "Team")!;
  assert.deepEqual(team.items.map((item) => item.href), ["/team", "/team/rangliste", "/team/erfolge", "/team/stufen"]);
  assert.ok(nav.items.some((item) => item.href === "/team/stufen" && item.label === "Karriere" && item.icon === "pyramid"));
  assert.equal(activeHref(team.items, "/team/stufen"), "/team/stufen");
  assert.equal(activeHref(nav.tabs, "/team/stufen"), "/team");
});

test("Update: wer schon ein Team hat, wird einmalig Teamleiter - Saetze und spaetere Aenderungen bleiben unberuehrt", () => {
  const file = path.join(dir, "legacy.db");
  const legacy = new Database(file);
  legacy.exec(`CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
    INSERT INTO teams VALUES(1, 'Bestand', datetime('now'));
    CREATE TABLE users(id INTEGER PRIMARY KEY, team_id INTEGER, name TEXT, email TEXT UNIQUE, password_hash TEXT, role TEXT, phone TEXT,
      active INTEGER DEFAULT 1, created_at TEXT, manager_id INTEGER);
    INSERT INTO users VALUES(1, 1, 'Kevin', 'kevin@test.de', '', 'LEADER', NULL, 1, datetime('now'), NULL);
    INSERT INTO users VALUES(2, 1, 'Lisa', 'lisa@test.de', '', 'MEMBER', NULL, 1, datetime('now'), 1);
    INSERT INTO users VALUES(3, 1, 'Tom', 'tom@test.de', '', 'MEMBER', NULL, 1, datetime('now'), 2);
    INSERT INTO users VALUES(4, 1, 'Max', 'max@test.de', '', 'MEMBER', NULL, 0, datetime('now'), 3);
    INSERT INTO users VALUES(5, 1, 'Paul', 'paul@test.de', '', 'MEMBER', NULL, 1, datetime('now'), 1);
    CREATE TABLE commission_settings(team_id INTEGER PRIMARY KEY, standard_percent REAL, share_promo INTEGER NOT NULL DEFAULT 1,
      share_follow INTEGER NOT NULL DEFAULT 1, min_share REAL, updated_by INTEGER, updated_at TEXT);
    INSERT INTO commission_settings(team_id, standard_percent, min_share) VALUES(1, 65, 80);`);
  legacy.close();
  process.env.DATABASE_PATH = file;
  global.__d2dDb = undefined;
  let db = getDb();
  const tier = (id: number) => (db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User).tier;
  // Lisa und Tom haben Leute unter sich (auch deaktivierte zaehlen) - Max und Paul nicht.
  assert.deepEqual([1, 2, 3, 4, 5].map(tier), ["BERATER", "TEAMLEITER", "TEAMLEITER", "BERATER", "BERATER"]);
  // Der Standardsatz bleibt, die neuen Stufen haben noch keinen eigenen Satz - niemand bekommt ploetzlich mehr oder weniger.
  assert.deepEqual(loadSettings(1), { standard_percent: 65, share_promo: 1, share_follow: 1, senior_percent: null, junior_percent: null, lead_percent: null });
  assert.throws(() => db.prepare("UPDATE users SET tier = 'CHEF' WHERE id = 5").run(), /CHECK/);
  // Der Junior Teamleiter ist erlaubt - auch in einer Datenbank, deren Pruefung ihn noch nicht kannte.
  db.prepare("UPDATE users SET tier = 'JUNIOR_LEAD' WHERE id = 5").run();
  assert.equal(tier(5), "JUNIOR_LEAD");
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  // Beim naechsten Start wird nichts mehr hochgestuft - eine Rueckstufung bleibt.
  db.prepare("UPDATE users SET tier = 'BERATER' WHERE id = 3").run();
  db.close(); global.__d2dDb = undefined; db = getDb();
  assert.equal(tier(3), "BERATER");
  db.close(); global.__d2dDb = undefined;
});

test("Update: eine Datenbank mit drei Stufen lernt den Junior Teamleiter und Rang-Beitraege im Feed", () => {
  const file = path.join(dir, "three-tiers.db");
  const legacy = new Database(file);
  legacy.exec(`CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
    INSERT INTO teams VALUES(1, 'Bestand', datetime('now'));
    CREATE TABLE users(id INTEGER PRIMARY KEY, team_id INTEGER, name TEXT, email TEXT UNIQUE, password_hash TEXT, role TEXT, phone TEXT,
      active INTEGER DEFAULT 1, created_at TEXT, manager_id INTEGER,
      tier TEXT NOT NULL DEFAULT 'BERATER' CHECK (tier IN ('BERATER','SENIOR','TEAMLEITER')));
    INSERT INTO users(id, team_id, name, email, password_hash, role, created_at, manager_id, tier)
      VALUES(1, 1, 'Kevin', 'kevin@test.de', '', 'LEADER', datetime('now'), NULL, 'BERATER'),
            (2, 1, 'Lisa', 'lisa@test.de', '', 'MEMBER', datetime('now'), 1, 'TEAMLEITER');
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('TEXT','SALE')), body TEXT NOT NULL DEFAULT '', visit_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  legacy.close();
  process.env.DATABASE_PATH = file;
  global.__d2dDb = undefined;
  const db = getDb();
  db.prepare("UPDATE users SET tier = 'JUNIOR_LEAD' WHERE id = 2").run();
  assert.throws(() => db.prepare("UPDATE users SET tier = 'CHEF' WHERE id = 2").run(), /CHECK/);
  db.prepare("INSERT INTO posts (team_id, user_id, kind, rank_tier) VALUES (1, 2, 'RANK', 'JUNIOR_LEAD')").run();
  assert.throws(() => db.prepare("INSERT INTO posts (team_id, user_id, kind) VALUES (1, 2, 'OTHER')").run(), /CHECK/);
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  db.close(); global.__d2dDb = undefined;
});
