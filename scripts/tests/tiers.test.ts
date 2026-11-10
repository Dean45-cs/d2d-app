import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { getDb } from "../../src/lib/db";
import { canLeadTeam, isTier, positionLabel, TIERS, TIER_LABEL } from "../../src/lib/tiers";
import { loadSettings } from "../../src/lib/commissions/store";
import type { User } from "../../src/lib/types";

/* Stufen im Vertrieb: Namen, wer ein Team haben darf, und das Update bestehender Datenbanken. */

const dir = mkdtempSync(path.join(tmpdir(), "d2d-tiers-"));
const previous = process.env.DATABASE_PATH;
after(() => {
  global.__d2dDb?.close(); global.__d2dDb = undefined;
  if (previous === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previous;
  rmSync(dir, { recursive: true, force: true });
});

test("Stufen heissen wie in der Praesentation - ein Team gibt es erst ab Teamleiter", () => {
  assert.deepEqual(TIERS.map((tier) => TIER_LABEL[tier]), ["Berater", "Senior Berater", "Teamleiter"]);
  assert.equal(canLeadTeam({ role: "MEMBER", tier: "BERATER" }), false);
  assert.equal(canLeadTeam({ role: "MEMBER", tier: "SENIOR" }), false);
  assert.equal(canLeadTeam({ role: "MEMBER", tier: "TEAMLEITER" }), true);
  // Die Geschaeftsfuehrung hat immer ein Team - ihre Stufe spielt keine Rolle.
  assert.equal(canLeadTeam({ role: "LEADER", tier: "BERATER" }), true);
  assert.equal(positionLabel({ role: "LEADER", tier: "BERATER" }), "Geschäftsführung");
  assert.equal(positionLabel({ role: "MEMBER", tier: "SENIOR" }), "Senior Berater");
  assert.ok(isTier("TEAMLEITER") && !isTier("LEADER") && !isTier(null) && !isTier("teamleiter"));
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
  assert.deepEqual(loadSettings(1), { standard_percent: 65, share_promo: 1, share_follow: 1, senior_percent: null, lead_percent: null });
  assert.throws(() => db.prepare("UPDATE users SET tier = 'CHEF' WHERE id = 5").run(), /CHECK/);
  // Beim naechsten Start wird nichts mehr hochgestuft - eine Rueckstufung bleibt.
  db.prepare("UPDATE users SET tier = 'BERATER' WHERE id = 3").run();
  db.close(); global.__d2dDb = undefined; db = getDb();
  assert.equal(tier(3), "BERATER");
  db.close(); global.__d2dDb = undefined;
});
