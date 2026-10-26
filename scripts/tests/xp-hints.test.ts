import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  XP_HINTS_KEY,
  levelFeedbackText,
  onXpHintsChange,
  setXpHints,
  xpHintsOn,
  type LevelFeedback,
} from "../../src/lib/level-feedback";

/* XP-Hinweise (src/lib/level-feedback.ts): je Geraet abschaltbar, Levelaufstieg bleibt. */

class MemoryStorage implements Storage {
  private entries = new Map<string, string>();
  get length(): number { return this.entries.size; }
  clear(): void { this.entries.clear(); }
  getItem(key: string): string | null { return this.entries.get(key) ?? null; }
  key(index: number): string | null { return [...this.entries.keys()][index] ?? null; }
  removeItem(key: string): void { this.entries.delete(key); }
  setItem(key: string, value: string): void { this.entries.set(key, String(value)); }
}

const realWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  const target = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.assign(target, { localStorage: storage }),
  });
});

afterEach(() => {
  if (realWindow) Object.defineProperty(globalThis, "window", realWindow);
  else delete (globalThis as { window?: unknown }).window;
});

function feedback(awardedXp: number, levelUp = false): LevelFeedback {
  return { progress: { level: 4 } as LevelFeedback["progress"], awardedXp, previousLevel: levelUp ? 3 : 4, levelUp };
}

test("XP-Hinweise sind standardmaessig an und nennen die XP", () => {
  assert.equal(xpHintsOn(), true);
  assert.equal(levelFeedbackText(feedback(100)), "+100 XP");
  assert.equal(levelFeedbackText(feedback(100, true)), "+100 XP · Level 4 erreicht!");
});

test("ausgeschaltet bleibt vom Hinweis nur der Levelaufstieg", () => {
  setXpHints(false);
  assert.equal(storage.getItem(XP_HINTS_KEY), "off");
  assert.equal(xpHintsOn(), false);
  assert.equal(levelFeedbackText(feedback(100)), "");
  assert.equal(levelFeedbackText(feedback(100, true)), "Level 4 erreicht!");
  assert.equal(levelFeedbackText(undefined), "");
});

test("wieder einschalten loescht den Eintrag", () => {
  setXpHints(false);
  setXpHints(true);
  assert.equal(storage.getItem(XP_HINTS_KEY), null);
  assert.equal(levelFeedbackText(feedback(50)), "+50 XP");
});

test("ein Wechsel wird gemeldet, auch aus einem anderen Fenster", () => {
  let calls = 0;
  const stop = onXpHintsChange(() => calls++);
  setXpHints(false);
  assert.equal(calls, 1);
  const other = Object.assign(new Event("storage"), { key: XP_HINTS_KEY });
  (globalThis.window as unknown as EventTarget).dispatchEvent(other);
  assert.equal(calls, 2);
  stop();
  setXpHints(true);
  assert.equal(calls, 2);
});

test("ohne Speicher (privater Modus) bleiben die Hinweise an", () => {
  Object.defineProperty(globalThis.window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    },
  });
  assert.equal(xpHintsOn(), true);
  assert.doesNotThrow(() => setXpHints(false));
});
