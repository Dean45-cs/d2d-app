import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  DOOR_TIMEOUT_MS,
  discard,
  enqueue,
  flush,
  forgetQueuedBell,
  getQueue,
  onDropped,
  subscribe,
  type QueuedWrite,
} from "../../src/lib/offline-queue";
import { levelProgress } from "../../src/lib/levels";
import type { LevelFeedback } from "../../src/lib/level-feedback";

const STORAGE_KEY = "d2d_pending_visits";
const firstUser = 11;
const secondUser = 22;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;

class MemoryStorage implements Storage {
  private entries = new Map<string, string>();
  get length(): number { return this.entries.size; }
  clear(): void { this.entries.clear(); }
  getItem(key: string): string | null { return this.entries.get(key) ?? null; }
  key(index: number): string | null { return [...this.entries.keys()][index] ?? null; }
  removeItem(key: string): void { this.entries.delete(key); }
  setItem(key: string, value: string): void { this.entries.set(key, String(value)); }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: { localStorage: storage },
  });
  globalThis.fetch = async () => { throw new Error("Unexpected fetch"); };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

function storedQueue(): QueuedWrite[] {
  return JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]") as QueuedWrite[];
}

function bodyOf(options?: RequestInit): Record<string, unknown> {
  assert.ok(options);
  assert.equal(options.method, "POST");
  assert.equal(typeof options.body, "string");
  return JSON.parse(options.body as string) as Record<string, unknown>;
}

function queueVisit(key: string, ownerUserId = firstUser) {
  return enqueue(key, { clientRequestId: key, outcome: "SALE" }, { ownerUserId });
}

function confirmed(progression?: LevelFeedback): Response {
  return Response.json({ ok: true, ...(progression ? { progression } : {}) });
}

test("full or blocked device storage never reports an unsaved visit as queued", () => {
  const seen: QueuedWrite[][] = [];
  const unsubscribe = subscribe((entries) => seen.push(entries), firstUser);
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  try {
    assert.throws(() => queueVisit("storage-full-request"), /Nicht gespeichert/);
    assert.equal(getQueue(firstUser).length, 0);
    assert.equal(seen.length, 0);
  } finally {
    unsubscribe();
  }
});

test("legacy delivery waits until its retry key can be persisted", async () => {
  storage.setItem(STORAGE_KEY, JSON.stringify([{
    localId: "1715000000000-blocked", createdAt: "2026-09-29T10:00:00.000Z",
    label: "Legacy visit", payload: { outcome: "NOT_HOME" },
  }]));
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return confirmed(); };
  assert.equal((await flush(firstUser)).remaining, 1);
  assert.equal(calls, 0);
});

test("failed queue removal keeps a confirmed request for a safe idempotent retry", async () => {
  queueVisit("storage-removal-request");
  storage.setItem = () => { throw new Error("Storage blocked"); };
  globalThis.fetch = async () => confirmed({ progress: levelProgress(100), awardedXp: 100, previousLevel: 1, levelUp: true });
  const result = await flush(firstUser);
  assert.equal(result.remaining, 1);
  assert.equal(result.sent, 0);
  assert.equal(result.progression, undefined);
});

test("the request ID from the original online attempt survives enqueue and every retry", async () => {
  const payload = { clientRequestId: "original-online-request", outcome: "SALE" };
  const queued = enqueue("A sale", payload, { ownerUserId: firstUser });
  assert.equal(queued.payload.clientRequestId, payload.clientRequestId);
  assert.equal(queued.payload.ownerUserId, firstUser);
  assert.deepEqual(payload, { clientRequestId: "original-online-request", outcome: "SALE" });

  const sent: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, options) => {
    sent.push(bodyOf(options));
    if (sent.length === 1) throw new TypeError("Connection lost after send");
    return confirmed();
  };
  const failed = await flush(firstUser);
  assert.deepEqual({ sent: failed.sent, remaining: failed.remaining, rejected: failed.rejected }, { sent: 0, remaining: 1, rejected: 0 });
  assert.equal(failed.progression, undefined);
  assert.equal(storedQueue()[0].payload.clientRequestId, payload.clientRequestId);

  const retried = await flush(firstUser);
  assert.equal(retried.sent, 1);
  assert.equal(retried.remaining, 0);
  assert.deepEqual(sent[0], sent[1]);
});

test("legacy visits receive a stable request ID that is persisted before the first fetch", async () => {
  storage.setItem(STORAGE_KEY, JSON.stringify([{
    localId: "1715000000000-legacy",
    createdAt: "2026-09-29T10:00:00.000Z",
    label: "Legacy visit",
    payload: { outcome: "NOT_HOME" },
  }]));
  const sentIds: string[] = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/visits");
    const requestId = bodyOf(options).clientRequestId;
    assert.equal(typeof requestId, "string");
    assert.match(requestId as string, /^[a-zA-Z0-9_-]{8,100}$/);
    assert.equal(storedQueue()[0].payload.clientRequestId, requestId);
    sentIds.push(requestId as string);
    if (sentIds.length === 1) throw new TypeError("Offline");
    return confirmed();
  };
  assert.equal((await flush(firstUser)).remaining, 1);
  assert.equal((await flush(firstUser)).remaining, 0);
  assert.equal(sentIds.length, 2);
  assert.equal(sentIds[0], sentIds[1]);
});

test("flush and subscribers isolate accounts while preserving another account's queued writes", async () => {
  const seen: QueuedWrite[][] = [];
  const unsubscribe = subscribe((entries) => seen.push(entries), firstUser);
  try {
    queueVisit("other-account-first", secondUser);
    queueVisit("my-account-visit", firstUser);
    enqueue("Other account house", { streetId: 5 }, { url: "/api/houses", kind: "house", ownerUserId: secondUser });
    assert.equal(getQueue(firstUser).length, 1);
    assert.equal(getQueue(secondUser).length, 2);
    assert.ok(seen.every((entries) => entries.every((entry) => entry.ownerUserId === firstUser)));

    const sent: Record<string, unknown>[] = [];
    globalThis.fetch = async (_url, options) => {
      sent.push(bodyOf(options));
      return confirmed();
    };
    const result = await flush(firstUser);
    assert.equal(result.sent, 1);
    assert.equal(result.remaining, 0);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].ownerUserId, firstUser);
    assert.equal(getQueue(secondUser).length, 2);
    assert.ok(storedQueue().every((entry) => entry.ownerUserId === secondUser));
  } finally {
    unsubscribe();
  }
});

for (const status of [401, 429, 500, 503]) {
  test(`HTTP ${status} keeps queued visits and stops delivery until a later retry`, async () => {
    queueVisit(`first-request-${status}`);
    queueVisit(`second-request-${status}`);
    const initialQueue = storage.getItem(STORAGE_KEY);
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("Try again later", { status });
    };
    const result = await flush(firstUser);
    assert.equal(calls, 1);
    assert.equal(result.sent, 0);
    assert.equal(result.rejected, 0);
    assert.equal(result.remaining, 2);
    assert.equal(result.progression, undefined);
    assert.equal(storage.getItem(STORAGE_KEY), initialQueue);

    globalThis.fetch = async () => confirmed();
    assert.equal((await flush(firstUser)).sent, 2);
  });
}

test("HTTP 403 holds only that entry with its reason while later visits are still delivered", async () => {
  queueVisit("reassigned-territory");
  queueVisit("still-allowed");
  const sent: string[] = [];
  globalThis.fetch = async (_url, options) => {
    const body = bodyOf(options);
    if (body.clientRequestId === "reassigned-territory") {
      return Response.json({ error: "Dieses Gebiet ist für dich nicht freigegeben." }, { status: 403 });
    }
    sent.push(String(body.clientRequestId));
    return confirmed();
  };
  const first = await flush(firstUser);
  assert.deepEqual(sent, ["still-allowed"]);
  assert.deepEqual([first.sent, first.rejected, first.held, first.remaining], [1, 0, 1, 1]);
  const [held] = getQueue(firstUser);
  assert.equal(held.payload.clientRequestId, "reassigned-territory");
  assert.equal(held.error, "Dieses Gebiet ist für dich nicht freigegeben.");

  // Beim naechsten Versuch keine erneute Meldung - und mit Berechtigung geht er raus.
  assert.equal((await flush(firstUser)).held, 0);
  globalThis.fetch = async () => confirmed();
  assert.equal((await flush(firstUser)).sent, 1);
  assert.equal(getQueue(firstUser).length, 0);
});

test("a hanging request times out and keeps the visit for a later retry", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  queueVisit("weak-signal");
  globalThis.fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  const pending = flush(firstUser);
  context.mock.timers.tick(DOOR_TIMEOUT_MS);
  const result = await pending;
  assert.deepEqual([result.sent, result.rejected, result.remaining], [0, 0, 1]);
});

test("discarded and rejected entries are announced so the door view can take them back", async () => {
  const dropped: string[] = [];
  const stop = onDropped((entries) => dropped.push(...entries.map((entry) => String(entry.payload.clientRequestId))));
  try {
    const kept = queueVisit("discard-me");
    queueVisit("invalid");
    assert.equal(discard(kept.localId), true);
    globalThis.fetch = async () => Response.json({ error: "Straße nicht gefunden." }, { status: 400 });
    assert.equal((await flush(firstUser)).rejected, 1);
    assert.deepEqual(dropped, ["discard-me", "invalid"]);
  } finally {
    stop();
  }
});

test("a bell removed on the device also leaves the queued house descriptions", () => {
  enqueue("Haus", { streetId: 4, houseNumber: "12 A", doorbells: [{ label: "Müller" }, { label: "Schmidt" }] }, {
    url: "/api/houses", kind: "house", ownerUserId: firstUser,
  });
  enqueue("Anderes Haus", { streetId: 4, houseNumber: "14", doorbells: [{ label: "Müller" }] }, {
    url: "/api/houses", kind: "house", ownerUserId: firstUser,
  });
  forgetQueuedBell(firstUser, 4, "12a", "müller");
  const [house, other] = storedQueue();
  assert.deepEqual(house.payload.doorbells, [{ label: "Schmidt" }]);
  assert.deepEqual(other.payload.doorbells, [{ label: "Müller" }]);
});

test("network failures stop the queue without awarding XP or dropping later visits", async () => {
  queueVisit("offline-first-request");
  queueVisit("offline-second-request");
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new TypeError("Failed to fetch");
  };
  const result = await flush(firstUser);
  assert.equal(calls, 1);
  assert.equal(result.sent, 0);
  assert.equal(result.rejected, 0);
  assert.equal(result.remaining, 2);
  assert.equal(result.progression, undefined);
});

test("confirmed XP aggregates across a batch while zero-XP replays preserve the latest balance", async () => {
  queueVisit("batch-first-request");
  queueVisit("batch-second-request");
  queueVisit("batch-replayed-request");
  enqueue("A house", { streetId: 5 }, { url: "/api/houses", kind: "house", ownerUserId: firstUser });
  const feedback: Array<LevelFeedback | undefined> = [
    { progress: levelProgress(100), awardedXp: 5, previousLevel: 1, levelUp: true },
    { progress: levelProgress(200), awardedXp: 100, previousLevel: 2, levelUp: false },
    { progress: levelProgress(200), awardedXp: 0, previousLevel: 2, levelUp: false },
    undefined,
  ];
  let calls = 0;
  globalThis.fetch = async () => confirmed(feedback[calls++]);
  const result = await flush(firstUser);
  assert.equal(result.sent, 4);
  assert.equal(result.remaining, 0);
  assert.deepEqual(result.progression, {
    progress: levelProgress(200),
    awardedXp: 105,
    previousLevel: 1,
    levelUp: true,
  });
});

test("an unreadable success response retains the visit and a later replay adds no phantom XP", async () => {
  queueVisit("lost-response-request");
  const sentIds: unknown[] = [];
  globalThis.fetch = async (_url, options) => {
    sentIds.push(bodyOf(options).clientRequestId);
    if (sentIds.length === 1) return new Response('{"ok":true,', { status: 200 });
    return confirmed({ progress: levelProgress(100), awardedXp: 0, previousLevel: 2, levelUp: false });
  };
  const first = await flush(firstUser);
  assert.equal(first.sent, 0);
  assert.equal(first.remaining, 1);
  assert.equal(first.progression, undefined);

  const retry = await flush(firstUser);
  assert.equal(retry.sent, 1);
  assert.equal(retry.remaining, 0);
  assert.equal(retry.progression?.awardedXp, 0);
  assert.equal(retry.progression?.levelUp, false);
  assert.equal(retry.progression?.progress.totalXp, 100);
  assert.deepEqual(sentIds, ["lost-response-request", "lost-response-request"]);
});

test("a partially delivered batch reports only confirmed XP and retains its failed tail", async () => {
  queueVisit("partial-first-request");
  queueVisit("partial-second-request");
  const progression = { progress: levelProgress(100), awardedXp: 100, previousLevel: 1, levelUp: true };
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 2) throw new TypeError("Connection lost");
    return confirmed(progression);
  };
  const result = await flush(firstUser);
  assert.equal(result.sent, 1);
  assert.equal(result.remaining, 1);
  assert.deepEqual(result.progression, progression);
  assert.equal(getQueue(firstUser)[0].payload.clientRequestId, "partial-second-request");
});

test("permanently invalid visits are rejected without blocking the next valid visit", async () => {
  queueVisit("invalid-first-request");
  queueVisit("valid-second-request");
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? new Response("Address deleted", { status: 400 }) : confirmed();
  };
  const result = await flush(firstUser);
  assert.equal(result.sent, 1);
  assert.equal(result.rejected, 1);
  assert.equal(result.remaining, 0);
});

test("overlapping flush attempts cannot send the same queue entry twice", async () => {
  queueVisit("concurrent-flush-request");
  let finish!: (response: Response) => void;
  let calls = 0;
  globalThis.fetch = () => {
    calls += 1;
    return new Promise<Response>((resolve) => { finish = resolve; });
  };
  const first = flush(firstUser);
  try {
    const concurrent = await flush(firstUser);
    assert.equal(concurrent.sent, 0);
    assert.equal(concurrent.remaining, 1);
    assert.equal(calls, 1);
  } finally {
    finish(confirmed());
  }
  assert.equal((await first).sent, 1);
  assert.equal(getQueue(firstUser).length, 0);
});
