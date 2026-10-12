import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, ValidationError } from "../../src/lib/api";
import { AuthError } from "../../src/lib/auth";

test("SQLite failures produce retryable responses without exposing internal details", async (context) => {
  const logged = context.mock.method(console, "error", () => {});
  for (const code of ["SQLITE_BUSY", "SQLITE_LOCKED", "SQLITE_IOERR", "SQLITE_FULL", "SQLITE_CONSTRAINT_TRIGGER"]) {
    const failure = Object.assign(new Error(`Internal database failure ${code}: /private/test.db`), { code });
    const response = await handle(async () => { throw failure; });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(typeof body.error, "string");
    assert.match(body.error, /erneut/);
    assert.ok(!JSON.stringify(body).includes(code));
    assert.ok(!JSON.stringify(body).includes("/private/test.db"));
  }
  assert.equal(logged.mock.callCount(), 5);
});

test("unexpected type and range errors remain retryable instead of rejecting queued visits", async (context) => {
  context.mock.method(console, "error", () => {});
  for (const failure of [new TypeError("Private internal property"), new RangeError("Private internal range")]) {
    const response = await handle(async () => { throw failure; });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.match(body.error, /Serverfehler/);
    assert.ok(!JSON.stringify(body).includes(failure.message));
  }
});

test("application validation still returns its actionable message with HTTP 400", async (context) => {
  context.mock.method(console, "error", () => {});
  for (const failure of [new Error("Diese Adresse ist gesperrt."), new ValidationError("Bitte ein Ergebnis wählen.")]) {
    const response = await handle(async () => { throw failure; });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: failure.message });
  }
});

test("authentication and authorization preserve their original statuses and messages", async () => {
  for (const status of [401, 403]) {
    const failure = new AuthError("Bitte mit dem richtigen Konto anmelden.", status);
    const response = await handle(async () => { throw failure; });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: failure.message });
  }
});

test("successful API results retain their existing JSON contract", async () => {
  const payload = { ok: true, progression: { awardedXp: 100 } };
  const response = await handle(async () => payload);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), payload);
  const empty = await handle(async () => undefined);
  assert.deepEqual(await empty.json(), { ok: true });
});
