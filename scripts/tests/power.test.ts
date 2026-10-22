import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import {
  IDLE_MS,
  POWER_KEY,
  POWER_SCRIPT,
  applyPowerSaving,
  onPowerChange,
  powerSaving,
  setPowerSaving,
  storedPowerSaving,
  whileActive,
} from "../../src/lib/power";
import { SAVE_WARM_INTERVAL_MS, WARM_INTERVAL_MS, shouldWarm } from "../../src/lib/offline-pages";

/*
 * Akku schonen (src/lib/power.ts): Fenster, Seite und Uhr sind nachgebaut,
 * die Uhr laeuft per mock.timers.
 */

class MemoryStorage implements Storage {
  private entries = new Map<string, string>();
  get length(): number { return this.entries.size; }
  clear(): void { this.entries.clear(); }
  getItem(key: string): string | null { return this.entries.get(key) ?? null; }
  key(index: number): string | null { return [...this.entries.keys()][index] ?? null; }
  removeItem(key: string): void { this.entries.delete(key); }
  setItem(key: string, value: string): void { this.entries.set(key, String(value)); }
}

/** Ein <head> mit den zwei Farben, die Next.js aus layout.tsx setzt. */
class FakeHead {
  children: FakeMeta[] = [];
  get firstChild() { return this.children[0] ?? null; }
  prepend(node: FakeMeta) {
    node.remove();
    node.parent = this;
    this.children.unshift(node);
  }
}

class FakeMeta {
  id = "";
  name = "";
  content = "";
  media = "";
  parent: FakeHead | null = null;
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((node) => node !== this);
    this.parent = null;
  }
}

let storage: MemoryStorage;
let head: FakeHead;
let fakeWindow: EventTarget & { localStorage: Storage };
let fakeDocument: EventTarget & {
  visibilityState: DocumentVisibilityState;
  documentElement: { dataset: Record<string, string | undefined> };
  head: FakeHead;
  getElementById: (id: string) => FakeMeta | null;
  createElement: (tag: string) => FakeMeta;
};

/** Die Farbe der Statusleiste: das erste passende meta-Tag gilt (hier: Hell). */
function statusBar(): string {
  return head.children.find((meta) => meta.name === "theme-color" && !meta.media.includes("dark"))!.content;
}
const originals = new Map<string, PropertyDescriptor | undefined>();

function install(name: string, value: unknown) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

beforeEach(() => {
  storage = new MemoryStorage();
  head = new FakeHead();
  for (const [media, content] of [["(prefers-color-scheme: dark)", "#000000"], ["(prefers-color-scheme: light)", "#f2f2f7"]]) {
    head.prepend(Object.assign(new FakeMeta(), { name: "theme-color", media, content }));
  }
  fakeWindow = Object.assign(new EventTarget(), { localStorage: storage });
  fakeDocument = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
    documentElement: { dataset: {} as Record<string, string | undefined> },
    head,
    getElementById: (id: string) => head.children.find((node) => node.id === id) ?? null,
    createElement: () => new FakeMeta(),
  });
  install("window", fakeWindow);
  install("document", fakeDocument);
});

afterEach(() => {
  mock.timers.reset();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  originals.clear();
});

function setVisibility(state: DocumentVisibilityState) {
  fakeDocument.visibilityState = state;
  fakeDocument.dispatchEvent(new Event("visibilitychange"));
}

/* ------------------------------ Der Schalter ----------------------------- */

test("switching on darkens the app, blackens the status bar and is remembered", () => {
  let changes = 0;
  const stop = onPowerChange(() => changes++);

  setPowerSaving(true);
  assert.equal(storage.getItem(POWER_KEY), "save");
  assert.equal(storedPowerSaving(), true);
  assert.equal(powerSaving(), true);
  assert.equal(fakeDocument.documentElement.dataset.theme, "dark");
  assert.equal(statusBar(), "#000");

  setPowerSaving(false);
  assert.equal(storage.getItem(POWER_KEY), null);
  assert.equal(powerSaving(), false);
  assert.equal(fakeDocument.documentElement.dataset.theme, undefined);
  // Die Statusleiste hat wieder ihre eigene Farbe - die Tags von Next.js blieben unberuehrt.
  assert.equal(statusBar(), "#f2f2f7");
  assert.equal(head.children.length, 2);
  assert.equal(changes, 2);
  stop();
});

test("applying again adds no second colour and keeps it in front", () => {
  applyPowerSaving(true);
  // Ein Seitenwechsel setzt die Farben von Next.js davor.
  head.prepend(Object.assign(new FakeMeta(), { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#f2f2f7" }));
  assert.equal(statusBar(), "#f2f2f7");
  applyPowerSaving(true);
  assert.equal(statusBar(), "#000");
  assert.equal(head.children.filter((meta) => meta.content === "#000").length, 1);
  applyPowerSaving(false);
  assert.equal(statusBar(), "#f2f2f7");
});

test("another window of the app switching the mode is picked up", () => {
  let changes = 0;
  const stop = onPowerChange(() => changes++);
  const event = Object.assign(new Event("storage"), { key: POWER_KEY, newValue: "save" });
  fakeWindow.dispatchEvent(event);
  assert.equal(powerSaving(), true);
  assert.equal(changes, 1);
  stop();
});

test("the early script sets the mode before React, and only when it is stored", () => {
  // Im Browser ist localStorage auch ohne "window." erreichbar.
  install("localStorage", storage);
  new Function(POWER_SCRIPT)();
  assert.equal(fakeDocument.documentElement.dataset.power, undefined);

  storage.setItem(POWER_KEY, "save");
  new Function(POWER_SCRIPT)();
  assert.equal(fakeDocument.documentElement.dataset.power, "save");
  assert.equal(fakeDocument.documentElement.dataset.theme, "dark");
  assert.equal(statusBar(), "#000");
  // Und wieder aus: das Tag des Skripts ist dasselbe, das applyPowerSaving kennt.
  applyPowerSaving(false);
  assert.equal(statusBar(), "#f2f2f7");
  assert.equal(head.children.length, 2);
});

test("without storage the mode is simply off", () => {
  const blocked = new EventTarget();
  Object.defineProperty(blocked, "localStorage", {
    get() {
      throw new Error("blocked");
    },
  });
  install("window", blocked);
  assert.equal(storedPowerSaving(), false);
});

/* --------------------------- Nur bei Bedienung --------------------------- */

test("location runs while the app is used and rests when nobody touches it", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const calls: string[] = [];
  const cleanup = whileActive(() => calls.push("start"), () => calls.push("stop"));
  assert.deepEqual(calls, ["start"]);

  // Ein Tipp kurz vor Ablauf schiebt die Pause hinaus.
  mock.timers.tick(IDLE_MS - 1000);
  fakeWindow.dispatchEvent(new Event("pointerdown"));
  mock.timers.tick(IDLE_MS - 1000);
  assert.deepEqual(calls, ["start"]);

  // Gespraech an der Tuer: niemand tippt - die Ortung ruht.
  mock.timers.tick(1000);
  assert.deepEqual(calls, ["start", "stop"]);

  // Der naechste Tipp weckt sie.
  fakeWindow.dispatchEvent(new Event("pointerdown"));
  assert.deepEqual(calls, ["start", "stop", "start"]);

  cleanup();
  assert.deepEqual(calls, ["start", "stop", "start", "stop"]);
  // Nach dem Aufraeumen weckt nichts mehr.
  fakeWindow.dispatchEvent(new Event("pointerdown"));
  mock.timers.tick(IDLE_MS * 2);
  assert.equal(calls.length, 4);
});

test("location rests in the background and resumes on return", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const calls: string[] = [];
  const cleanup = whileActive(() => calls.push("start"), () => calls.push("stop"));

  setVisibility("hidden");
  assert.deepEqual(calls, ["start", "stop"]);
  // Tippen auf eine unsichtbare Seite gibt es nicht - und es weckt auch nichts.
  fakeWindow.dispatchEvent(new Event("keydown"));
  assert.deepEqual(calls, ["start", "stop"]);
  // Kein verwaister Zeitgeber, der spaeter noch einmal stoppt.
  mock.timers.tick(IDLE_MS * 2);
  assert.deepEqual(calls, ["start", "stop"]);

  setVisibility("visible");
  assert.deepEqual(calls, ["start", "stop", "start"]);
  cleanup();
});

test("a page opened in the background does not start locating", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  fakeDocument.visibilityState = "hidden";
  const calls: string[] = [];
  const cleanup = whileActive(() => calls.push("start"), () => calls.push("stop"));
  assert.deepEqual(calls, []);
  setVisibility("visible");
  assert.deepEqual(calls, ["start"]);
  cleanup();
});

test("scrolling keeps location awake without restarting it", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const calls: string[] = [];
  const cleanup = whileActive(() => calls.push("start"), () => calls.push("stop"));
  for (let i = 0; i < 300; i++) {
    mock.timers.tick(500);
    fakeWindow.dispatchEvent(new Event("wheel"));
  }
  assert.deepEqual(calls, ["start"]);
  cleanup();
});

/* -------------------------- Gespeicherte Seiten -------------------------- */

test("stored pages are refreshed far less often in power saving mode", () => {
  storage.setItem("d2d_pages_warmed_at", String(1_000_000));
  install("navigator", { onLine: true, serviceWorker: { controller: {} } });
  Object.assign(fakeWindow, { matchMedia: () => ({ matches: true }) });

  const later = 1_000_000 + WARM_INTERVAL_MS + 1;
  applyPowerSaving(true);
  assert.equal(shouldWarm(later), false);
  assert.equal(shouldWarm(1_000_000 + SAVE_WARM_INTERVAL_MS + 1), true);

  applyPowerSaving(false);
  storage.setItem("d2d_pages_warmed_at", String(1_000_000));
  assert.equal(shouldWarm(later), true);
});
