import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { avatarSrc, decodeAvatar } from "../../src/lib/avatar-src";
import { teamTotals } from "../../src/lib/community";
import { listMembers } from "../../src/lib/queries";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-avatar-"));
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

const pixel = `data:image/png;base64,${Buffer.from("kleines-bild").toString("base64")}`;
const other = `data:image/jpeg;base64,${Buffer.from("anderes-bild").toString("base64")}`;

test("pages get a short, cacheable address instead of the whole image", () => {
  const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Bilder')").run().lastInsertRowid);
  const insert = db.prepare("INSERT INTO users(team_id, name, email, password_hash, role, avatar) VALUES (?, ?, ?, 'x', 'MEMBER', ?)");
  const withImage = Number(insert.run(team, "Mit Bild", "mit@example.test", pixel).lastInsertRowid);
  const without = Number(insert.run(team, "Ohne Bild", "ohne@example.test", "").lastInsertRowid);

  const members = new Map(listMembers(team).map((member) => [member.id, member.avatar]));
  assert.match(members.get(withImage) ?? "", new RegExp(`^/api/avatars/${withImage}\\?v=[\\w-]{12}$`));
  assert.equal(members.get(without), "");
  assert.equal(teamTotals(team).find((row) => row.user_id === withImage)?.avatar, members.get(withImage));

  // Ein neues Bild hat eine neue Adresse - der alte Zwischenspeicher greift nicht mehr.
  db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(other, withImage);
  const changed = listMembers(team).find((member) => member.id === withImage)?.avatar;
  assert.notEqual(changed, members.get(withImage));
  assert.equal(changed, avatarSrc(withImage, other));
});

test("stored images decode to the bytes and type the browser needs", () => {
  assert.deepEqual(decodeAvatar(pixel), { type: "image/png", bytes: Buffer.from("kleines-bild") });
  assert.equal(decodeAvatar("data:text/html;base64,PGI+"), null);
  assert.equal(avatarSrc(1, ""), "");
});
