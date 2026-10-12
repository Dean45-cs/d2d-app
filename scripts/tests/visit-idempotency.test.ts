import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import type { createVisit } from "../../src/lib/queries";
import { createVisitOnce, findVisitRequest, parseVisitRequestId } from "../../src/lib/visit-idempotency";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-visit-idempotency-"));
const previousDatabasePath = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = path.join(directory, "test.db");
const db = getDb();
after(() => {
  db.close();
  global.__d2dDb = undefined;
  if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previousDatabasePath;
  rmSync(directory, { recursive: true, force: true });
});

const teamId = Number(db.prepare("INSERT INTO teams (name) VALUES ('Idempotency test')").run().lastInsertRowid);
const otherTeamId = Number(db.prepare("INSERT INTO teams (name) VALUES ('Other team')").run().lastInsertRowid);
let sequence = 0;

function addUser(team = teamId): number {
  sequence += 1;
  return Number(db.prepare(
    "INSERT INTO users (team_id, name, email, password_hash, role) VALUES (?, ?, ?, 'unused', 'MEMBER')",
  ).run(team, `Person ${sequence}`, `idempotency-${sequence}@example.test`).lastInsertRowid);
}

function input(userId: number, overrides: Partial<Parameters<typeof createVisit>[0]> = {}): Parameters<typeof createVisit>[0] {
  return {
    teamId,
    userId,
    territoryId: null,
    streetId: null,
    houseNumber: "12",
    doorbellId: null,
    outcome: "SALE",
    reasonId: null,
    reasonNote: "",
    energyType: "STROM",
    followUpAt: null,
    lat: null,
    lng: null,
    ...overrides,
  };
}

function count(table: "visits" | "posts" | "visit_requests", userId: number): number {
  return (db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id = ?`).get(userId) as { total: number }).total;
}

test("repeated delivery returns the original visit and creates only one sale post", () => {
  const userId = addUser();
  const payload = input(userId);
  const first = createVisitOnce(teamId, userId, "sale-retry", payload);
  assert.equal(typeof first.id, "number");
  assert.deepEqual(first, { id: first.id, replayed: false, deleted: false });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.deepEqual(createVisitOnce(teamId, userId, "sale-retry", payload), {
      id: first.id, replayed: true, deleted: false,
    });
  }
  assert.equal(count("visits", userId), 1);
  assert.equal(count("posts", userId), 1);
  assert.equal(count("visit_requests", userId), 1);
  const post = db.prepare("SELECT visit_id, kind FROM posts WHERE user_id = ?").get(userId);
  assert.deepEqual(post, { visit_id: first.id, kind: "SALE" });
});

test("a retry after undo keeps its tombstone and cannot recreate a deleted sale", () => {
  const userId = addUser();
  const payload = input(userId);
  const first = createVisitOnce(teamId, userId, "undone-sale", payload);
  db.prepare("DELETE FROM visits WHERE id = ?").run(first.id);
  assert.equal(count("posts", userId), 0);
  assert.equal(count("visit_requests", userId), 1);
  const tombstone = db.prepare(
    "SELECT visit_id FROM visit_requests WHERE user_id = ? AND client_request_id = ?",
  ).get(userId, "undone-sale");
  assert.deepEqual(tombstone, { visit_id: null });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.deepEqual(createVisitOnce(teamId, userId, "undone-sale", payload), {
      id: null, replayed: true, deleted: true,
    });
  }
  assert.equal(count("visits", userId), 0);
  assert.equal(count("posts", userId), 0);

  const replacement = createVisitOnce(teamId, userId, "new-sale-after-undo", payload);
  assert.equal(replacement.replayed, false);
  assert.equal(replacement.deleted, false);
  assert.notEqual(replacement.id, first.id);
  assert.equal(count("visits", userId), 1);
});

test("request identifiers are scoped to their user, including users in another team", () => {
  const firstUser = addUser();
  const secondUser = addUser();
  const thirdUser = addUser(otherTeamId);
  const owners = [
    { userId: firstUser, team: teamId },
    { userId: secondUser, team: teamId },
    { userId: thirdUser, team: otherTeamId },
  ];
  const ids = owners.map(({ userId, team }) => {
    const payload = input(userId, { teamId: team });
    const result = createVisitOnce(team, userId, "shared-request-id", payload);
    assert.equal(result.replayed, false);
    assert.deepEqual(createVisitOnce(team, userId, "shared-request-id", payload), {
      id: result.id, replayed: true, deleted: false,
    });
    assert.equal(count("visits", userId), 1);
    assert.equal(count("posts", userId), 1);
    return result.id;
  });
  assert.equal(new Set(ids).size, owners.length);
});

test("distinct requests for the same door stay distinct and legacy clients need no key", () => {
  const userId = addUser();
  const payload = input(userId, { outcome: "NOT_HOME", energyType: "" });
  const results = [
    createVisitOnce(teamId, userId, "first-attempt", payload),
    createVisitOnce(teamId, userId, "second-attempt", payload),
    createVisitOnce(teamId, userId, null, payload),
    createVisitOnce(teamId, userId, null, payload),
  ];
  assert.ok(results.every((result) => !result.replayed && !result.deleted && result.id !== null));
  assert.equal(new Set(results.map((result) => result.id)).size, 4);
  assert.equal(count("visits", userId), 4);
  assert.equal(count("posts", userId), 0);
  assert.equal(count("visit_requests", userId), 2);
});

test("request lookup cannot expose another team's visit and mismatched ownership cannot write", () => {
  const userId = addUser();
  const otherUser = addUser(otherTeamId);
  const key = "ownership-boundary";
  createVisitOnce(teamId, userId, key, input(userId));
  assert.equal(findVisitRequest(otherTeamId, userId, key), null);
  assert.equal(findVisitRequest(teamId, otherUser, key), null);

  assert.throws(() => createVisitOnce(teamId, userId, "wrong-input-user", input(otherUser)));
  assert.throws(() => createVisitOnce(teamId, userId, "wrong-input-team", input(userId, { teamId: otherTeamId })));
  assert.throws(() => createVisitOnce(teamId, otherUser, "wrong-team-owner", input(otherUser)));
  assert.equal(count("visits", userId), 1);
  assert.equal(count("visit_requests", userId), 1);
  assert.equal(count("visits", otherUser), 0);
  assert.equal(count("visit_requests", otherUser), 0);

  db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(userId);
  assert.throws(() => createVisitOnce(teamId, userId, "disabled-owner", input(userId)));
  assert.equal(count("visits", userId), 1);
});

test("malformed request IDs are rejected instead of silently disabling replay protection", () => {
  assert.equal(parseVisitRequestId(undefined), null);
  assert.equal(parseVisitRequestId(null), null);
  assert.equal(parseVisitRequestId("a".repeat(8)), "a".repeat(8));
  assert.equal(parseVisitRequestId("b".repeat(100)), "b".repeat(100));
  assert.equal(parseVisitRequestId("legacy_12-abc"), "legacy_12-abc");
  for (const invalid of ["", "short", "a".repeat(101), "with spaces", "bad/key/123", 12345678, {}, []]) {
    assert.throws(() => parseVisitRequestId(invalid), /Anfrage-ID/);
  }
});

test("a sale-post failure rolls back both its visit and request so the same request can retry", () => {
  const userId = addUser();
  const payload = input(userId);
  db.exec(`CREATE TEMP TRIGGER reject_test_sale_post BEFORE INSERT ON posts
    WHEN NEW.user_id = ${userId}
    BEGIN SELECT RAISE(ABORT, 'simulated post failure'); END`);
  try {
    assert.throws(() => createVisitOnce(teamId, userId, "retry-after-post-failure", payload), /simulated post failure/);
    assert.equal(count("visits", userId), 0);
    assert.equal(count("posts", userId), 0);
    assert.equal(count("visit_requests", userId), 0);
  } finally {
    db.exec("DROP TRIGGER reject_test_sale_post");
  }
  const retry = createVisitOnce(teamId, userId, "retry-after-post-failure", payload);
  assert.equal(retry.replayed, false);
  assert.equal(count("visits", userId), 1);
  assert.equal(count("posts", userId), 1);
  assert.equal(count("visit_requests", userId), 1);
});

test("a request-ledger failure rolls back visit, sale post and automatic territory updates", () => {
  const userId = addUser();
  const territoryId = Number(db.prepare(
    "INSERT INTO territories (team_id, name) VALUES (?, 'Rollback territory')",
  ).run(teamId).lastInsertRowid);
  const streetId = Number(db.prepare(
    "INSERT INTO streets (territory_id, name) VALUES (?, 'Rollback street')",
  ).run(territoryId).lastInsertRowid);
  const payload = input(userId, { territoryId, streetId });
  db.exec(`CREATE TEMP TRIGGER reject_test_request BEFORE INSERT ON visit_requests
    WHEN NEW.user_id = ${userId}
    BEGIN SELECT RAISE(ABORT, 'simulated request failure'); END`);
  try {
    assert.throws(() => createVisitOnce(teamId, userId, "retry-after-ledger-failure", payload), /simulated request failure/);
    assert.equal(count("visits", userId), 0);
    assert.equal(count("posts", userId), 0);
    assert.equal(count("visit_requests", userId), 0);
    assert.deepEqual(db.prepare("SELECT status FROM streets WHERE id = ?").get(streetId), { status: "OPEN" });
    assert.deepEqual(db.prepare("SELECT status FROM territories WHERE id = ?").get(territoryId), { status: "OPEN" });
  } finally {
    db.exec("DROP TRIGGER reject_test_request");
  }
  const retry = createVisitOnce(teamId, userId, "retry-after-ledger-failure", payload);
  assert.equal(retry.replayed, false);
  assert.equal(count("visits", userId), 1);
  assert.equal(count("posts", userId), 1);
  assert.equal(count("visit_requests", userId), 1);
  assert.deepEqual(db.prepare("SELECT status FROM streets WHERE id = ?").get(streetId), { status: "ACTIVE" });
  assert.deepEqual(db.prepare("SELECT status FROM territories WHERE id = ?").get(territoryId), { status: "ACTIVE" });
});
