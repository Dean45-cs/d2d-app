import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { DEFAULT_REASON_ICON, REASON_ICONS, isReasonIcon, reasonIcon, reasonIconFor } from "../../src/lib/reason-icons";

const dir = mkdtempSync(path.join(tmpdir(), "d2d-reason-icons-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
after(() => {
  global.__d2dDb?.close();
  global.__d2dDb = undefined;
  rmSync(dir, { recursive: true, force: true });
});

test("every default reason has its own known icon", async () => {
  const { DEFAULT_REASONS } = await import("../../src/lib/queries");
  for (const reason of DEFAULT_REASONS) assert.ok(isReasonIcon(reason.icon), `${reason.code}: ${reason.icon}`);
  assert.equal(new Set(DEFAULT_REASONS.map((reason) => reason.icon)).size, DEFAULT_REASONS.length);
  assert.equal(new Set(REASON_ICONS.map((icon) => icon.key)).size, REASON_ICONS.length);
});

test("legacy emoji map to the closest icon, unknown ones to the default", () => {
  assert.equal(reasonIconFor("KEINE_ZEIT", "🙂"), "stopwatch", "the code of a default reason wins");
  assert.equal(reasonIconFor("EIGEN_1", "📦"), "box");
  assert.equal(reasonIconFor("EIGEN_2", "🗣️"), "speech", "variation selectors are ignored");
  assert.equal(reasonIconFor("EIGEN_3", "👍🏽"), "smile", "skin tones are ignored");
  assert.equal(reasonIconFor("EIGEN_4", "🦄"), DEFAULT_REASON_ICON);
  assert.equal(reasonIconFor("EIGEN_5", ""), DEFAULT_REASON_ICON);
  assert.equal(reasonIcon("gibt-es-nicht").key, DEFAULT_REASON_ICON);
  assert.equal(isReasonIcon("💬"), false);
});

test("an existing database gets icons for its emoji reasons on start", async () => {
  // Stand vor der Umstellung: Spalte "emoji", noch keine Spalte "icon".
  const old = new Database(process.env.DATABASE_PATH!);
  old.exec(`
    CREATE TABLE rejection_reasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, code TEXT NOT NULL,
      label TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '', hint TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, UNIQUE (team_id, code)
    );
    INSERT INTO rejection_reasons (team_id, code, label, emoji) VALUES
      (1, 'MIETER', 'Mieter', '🔑'), (1, 'EIGEN_1', 'Zieht bald um', '📦'), (1, 'EIGEN_2', 'Hund', '🐕');
  `);
  old.close();

  const { getDb } = await import("../../src/lib/db");
  const rows = getDb().prepare("SELECT code, icon FROM rejection_reasons ORDER BY id").all();
  assert.deepEqual(rows, [
    { code: "MIETER", icon: "key" },
    { code: "EIGEN_1", icon: "box" },
    { code: "EIGEN_2", icon: DEFAULT_REASON_ICON },
  ]);
});
