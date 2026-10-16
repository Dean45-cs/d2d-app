import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { enqueue, flush, getQueue } from "../../src/lib/offline-queue";

const userId = 31;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;

class MemoryStorage {
  private entries = new Map<string, string>();
  getItem(key: string): string | null { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string): void { this.entries.set(key, String(value)); }
  removeItem(key: string): void { this.entries.delete(key); }
}

beforeEach(() => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: { localStorage: storage, dispatchEvent: () => true },
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

test("a confirmed sale waits while its opening is held - it is never thrown away", async () => {
  const draftKey = "draft-held-0001";
  enqueue("Auftrag begonnen", { draftKey, action: "OPEN", streetId: 1 }, { url: "/api/sale-drafts", ownerUserId: userId });
  enqueue("Abschluss bestätigen", { draftKey, action: "CONFIRM" }, { url: "/api/sale-drafts", ownerUserId: userId });
  const calls: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
    calls.push(body);
    if (body.action === "OPEN") return Response.json({ error: "Dieses Gebiet ist für dich nicht freigegeben." }, { status: 403 });
    return Response.json({ error: "Offener Auftrag nicht gefunden." }, { status: 400 });
  };

  const result = await flush(userId);
  assert.deepEqual(calls.map((body) => body.action), ["OPEN"]);
  assert.equal(result.rejected, 0);
  const queue = getQueue(userId);
  assert.deepEqual(queue.map((entry) => entry.payload.action), ["OPEN", "CONFIRM"]);
  assert.match(queue[1].error ?? "", /Wartet/);
});

test("queued doors carry the moment they were recorded; house descriptions do not", async () => {
  const visit = enqueue("Tür", { outcome: "NOT_HOME", streetId: 1, houseNumber: "3" }, { ownerUserId: userId });
  enqueue("Haus", { streetId: 1, houseNumber: "3", buildingType: "EFH" }, { url: "/api/houses", kind: "house", ownerUserId: userId });
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(String(options?.body)) as Record<string, unknown>);
    return Response.json({ ok: true });
  };
  await flush(userId);
  assert.equal(bodies[0].recordedAt, visit.createdAt);
  assert.equal("recordedAt" in bodies[1], false);
});
