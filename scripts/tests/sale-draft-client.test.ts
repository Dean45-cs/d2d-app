import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { beginSaleDraft, localSaleDrafts } from "../../src/lib/sale-drafts-client";
import { getQueue } from "../../src/lib/offline-queue";

const userId = 7;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

class MemoryStorage {
  private entries = new Map<string, string>();
  getItem(key: string): string | null { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string): void { this.entries.set(key, String(value)); }
  removeItem(key: string): void { this.entries.delete(key); }
}

beforeEach(() => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: storage });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: { localStorage: storage, dispatchEvent: () => true },
  });
});
afterEach(() => {
  for (const [name, original] of [["window", originalWindow], ["localStorage", originalStorage]] as const) {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  }
});

const door = { territoryId: 1, streetId: 2, houseNumber: "7", doorbellLabel: "", doorbellFloor: "" };

test("tapping the same product again reuses the open order", () => {
  const first = beginSaleDraft(userId, { ...door, energyType: "STROM" }, "Hauptstraße 7");
  const again = beginSaleDraft(userId, { ...door, energyType: "STROM" }, "Hauptstraße 7");
  assert.equal(again.draft_key, first.draft_key);
  assert.equal(getQueue(userId).length, 1);
});

test("a different product replaces the open order instead of confirming the old product", () => {
  const strom = beginSaleDraft(userId, { ...door, energyType: "STROM" }, "Hauptstraße 7");
  const beides = beginSaleDraft(userId, { ...door, energyType: "BEIDES" }, "Hauptstraße 7");
  assert.notEqual(beides.draft_key, strom.draft_key);

  const drafts = localSaleDrafts(userId);
  assert.deepEqual(
    drafts.map((draft) => [draft.payload.energyType, draft.status]),
    [["BEIDES", "OPEN"], ["STROM", "ABORTED"]],
  );
  assert.deepEqual(
    getQueue(userId).map((entry) => [entry.payload.action, entry.payload.draftKey]),
    [["OPEN", strom.draft_key], ["OPEN", beides.draft_key], ["ABORT", strom.draft_key]],
  );
});
