import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { authenticate, changeOwnPassword, hashPassword } from "../../src/lib/auth";
import {
  clientAddress,
  FailureThrottle,
  loginBlockedFor,
  MAX_FAILURES_PER_ACCOUNT,
  MAX_FAILURES_PER_CLIENT,
  recordLoginFailure,
  recordLoginSuccess,
  retryText,
  THROTTLE_WINDOW_MS,
} from "../../src/lib/login-throttle";

const dir = mkdtempSync(path.join(tmpdir(), "d2d-login-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
const db = getDb();
after(() => { db.close(); global.__d2dDb = undefined; rmSync(dir, { recursive: true, force: true }); });
const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Test')").run().lastInsertRowid);
const userId = Number(db.prepare("INSERT INTO users(team_id, name, email, password_hash, role) VALUES (?, 'Mia', 'mia@test.de', ?, 'MEMBER')")
  .run(team, hashPassword("startpasswort")).lastInsertRowid);
const sessionVersion = () => (db.prepare("SELECT session_version FROM users WHERE id = ?").get(userId) as { session_version: number }).session_version;

test("an account locks after repeated failures from one client and frees once the window passes", () => {
  const throttle = new FailureThrottle();
  const attempt = { email: "Mia@test.de", client: "1.2.3.4" };
  const start = 1_000_000;
  for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i += 1) {
    assert.equal(loginBlockedFor(attempt, throttle, start + i), 0);
    recordLoginFailure(attempt, throttle, start + i);
  }
  const wait = loginBlockedFor(attempt, throttle, start + MAX_FAILURES_PER_ACCOUNT);
  assert.ok(wait > 0 && wait <= THROTTLE_WINDOW_MS);
  // Gross- und Kleinschreibung der E-Mail umgeht die Sperre nicht.
  assert.ok(loginBlockedFor({ ...attempt, email: " mia@TEST.de " }, throttle, start + MAX_FAILURES_PER_ACCOUNT) > 0);
  // Wer die E-Mail einer Kollegin kennt, sperrt sie damit nicht von ihrem eigenen Handy aus.
  assert.equal(loginBlockedFor({ ...attempt, client: "5.6.7.8" }, throttle, start + MAX_FAILURES_PER_ACCOUNT), 0);
  // Mit dem aeltesten Fehlversuch faellt auch die Sperre aus dem Fenster.
  assert.equal(loginBlockedFor(attempt, throttle, start + THROTTLE_WINDOW_MS), 0);
});

test("a client trying many accounts is stopped, and a success only clears its own account", () => {
  const throttle = new FailureThrottle();
  const client = "9.9.9.9";
  for (let i = 0; i < MAX_FAILURES_PER_CLIENT; i += 1) recordLoginFailure({ email: `user${i}@test.de`, client }, throttle, 0);
  assert.ok(loginBlockedFor({ email: "neu@test.de", client }, throttle, 1) > 0);

  const other = new FailureThrottle();
  const attempt = { email: "mia@test.de", client: "1.1.1.1" };
  for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT - 1; i += 1) recordLoginFailure(attempt, other, 0);
  recordLoginSuccess(attempt, other);
  recordLoginFailure(attempt, other, 1);
  assert.equal(loginBlockedFor(attempt, other, 2), 0);
});

test("the throttle forgets old keys instead of growing without bound", () => {
  const throttle = new FailureThrottle(1000, 50);
  for (let i = 0; i < 500; i += 1) throttle.fail(`key${i}`, i);
  assert.equal(throttle.blockedFor("key499", 1, 500) > 0, true);
  assert.equal(throttle.blockedFor("key0", 1, 500), 0);
});

test("the client address cannot be spoofed with a forwarded-for prefix", () => {
  assert.equal(clientAddress(new Headers({ "fly-client-ip": "8.8.8.8", "x-forwarded-for": "1.1.1.1" })), "8.8.8.8");
  assert.equal(clientAddress(new Headers({ "x-forwarded-for": "6.6.6.6, 2.2.2.2" })), "2.2.2.2");
  assert.equal(clientAddress(new Headers({ "x-real-ip": "3.3.3.3" })), "3.3.3.3");
  assert.equal(clientAddress(new Headers()), "unbekannt");
  assert.equal(retryText(1), "in einer Minute");
  assert.equal(retryText(14 * 60_000 + 1), "in 15 Minuten");
});

test("changing the own password needs the current one and ends every other session", () => {
  assert.equal(authenticate("nobody@test.de", "egal"), null);
  const before = sessionVersion();
  assert.equal(changeOwnPassword(userId, "falsch", "neuespasswort"), false);
  assert.equal(sessionVersion(), before);
  assert.throws(() => changeOwnPassword(userId, "startpasswort", "kurz"), /mindestens 8/);
  assert.throws(() => changeOwnPassword(userId, "startpasswort", "startpasswort"), /dasselbe/);

  db.prepare("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, 'https://fcm.googleapis.com/x', 'p', 'a')").run(userId);
  assert.equal(changeOwnPassword(userId, "startpasswort", "neuespasswort"), true);
  assert.equal(sessionVersion(), before + 1);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?").get(userId) as { n: number }).n, 0);
  assert.equal(authenticate("mia@test.de", "startpasswort"), null);
  assert.equal(authenticate("mia@test.de", "neuespasswort")?.id, userId);
});
