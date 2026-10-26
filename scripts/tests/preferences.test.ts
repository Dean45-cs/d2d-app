import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  DEFAULT_PREFS,
  PREFS_KEY,
  PREFS_SCRIPT,
  STATUS_META_ID,
  applyPrefs,
  onPrefsChange,
  readPrefs,
  resetPrefs,
  sanitizePrefs,
  setPrefs,
  toastDuration,
  type Preferences,
} from "../../src/lib/preferences";
import { POWER_KEY, POWER_SCRIPT, setPowerSaving } from "../../src/lib/power";

/*
 * Einstellungen je Geraet (src/lib/preferences.ts): Speicher, Merkmale am
 * <html>, das Skript vor dem ersten Bild und das Zusammenspiel mit dem
 * Energiesparmodus. Fenster und Seite sind nachgebaut.
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

class FakeHead {
  children: FakeMeta[] = [];
  get firstChild() { return this.children[0] ?? null; }
  prepend(node: FakeMeta) {
    node.remove();
    node.parent = this;
    this.children.unshift(node);
  }
}

let storage: MemoryStorage;
let head: FakeHead;
let dataset: Record<string, string | undefined>;
const originals = new Map<string, PropertyDescriptor | undefined>();

function install(name: string, value: unknown) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function freshPage() {
  head = new FakeHead();
  for (const [media, content] of [["(prefers-color-scheme: dark)", "#000000"], ["(prefers-color-scheme: light)", "#f2f2f7"]]) {
    head.prepend(Object.assign(new FakeMeta(), { name: "theme-color", media, content }));
  }
  dataset = {};
  install("document", {
    documentElement: { dataset },
    head,
    getElementById: (id: string) => head.children.find((node) => node.id === id) ?? null,
    createElement: () => new FakeMeta(),
  });
}

beforeEach(() => {
  storage = new MemoryStorage();
  install("window", Object.assign(new EventTarget(), { localStorage: storage }));
  install("localStorage", storage);
  freshPage();
});

afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  originals.clear();
});

/** Die Farbe der Statusleiste: das erste passende meta-Tag (hier: ein helles System). */
const statusBar = () => head.children.find((meta) => meta.name === "theme-color" && !meta.media.includes("dark"))!.content;
const clean = (record: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));

test("ohne Gespeichertes gilt der Standard, und am <html> steht nichts", () => {
  assert.deepEqual(readPrefs(), DEFAULT_PREFS);
  applyPrefs();
  assert.deepEqual(clean(dataset), {});
  assert.equal(statusBar(), "#f2f2f7");
});

test("gespeichert wird nur, was vom Standard abweicht", () => {
  setPrefs({ accent: "rot", tourNearbyHint: false });
  assert.deepEqual(JSON.parse(storage.getItem(PREFS_KEY)!), { accent: "rot", tourNearbyHint: false });
  setPrefs({ accent: "gruen", tourNearbyHint: true });
  assert.equal(storage.getItem(PREFS_KEY), null);
});

test("Unsinn im Speicher faellt Feld fuer Feld auf den Standard zurueck", () => {
  const prefs = sanitizePrefs({
    accent: "lila",
    theme: "dark",
    glass: "nein",
    goalDoors: 9999,
    goalMet: "7",
    hiddenAreas: ["team", "kaffee", "team"],
    hiddenStart: "radar",
  });
  assert.equal(prefs.accent, "gruen");
  assert.equal(prefs.theme, "dark");
  assert.equal(prefs.glass, true);
  assert.equal(prefs.goalDoors, 150);
  assert.equal(prefs.goalMet, 7);
  assert.deepEqual(prefs.hiddenAreas, ["team"]);
  assert.deepEqual(prefs.hiddenStart, []);
  storage.setItem(PREFS_KEY, "{kaputt");
  assert.deepEqual(readPrefs(), DEFAULT_PREFS);
});

test("readPrefs liefert dasselbe Objekt, solange sich nichts aendert", () => {
  setPrefs({ accent: "blau" });
  assert.equal(readPrefs(), readPrefs());
});

test("eine Aenderung setzt die Merkmale sofort und wird gemeldet - auch aus einem anderen Fenster", () => {
  let calls = 0;
  const stop = onPrefsChange(() => calls++);
  setPrefs({ accent: "violett", tint: false, textSize: "xl", glass: false, motion: false, contrast: true });
  assert.deepEqual(clean(dataset), { accent: "violett", tint: "off", text: "xl", glass: "off", motion: "off", contrast: "more" });
  assert.equal(calls, 1);

  storage.setItem(PREFS_KEY, JSON.stringify({ accent: "gold", hiddenAreas: ["map"] }));
  (globalThis.window as unknown as EventTarget).dispatchEvent(Object.assign(new Event("storage"), { key: PREFS_KEY }));
  assert.deepEqual(clean(dataset), { accent: "gold", hide: "area-map" });
  assert.equal(calls, 2);
  stop();
});

test("Zuruecksetzen raeumt Speicher und Merkmale", () => {
  setPrefs({ accent: "pink", theme: "dark", hiddenStart: ["radar"] });
  resetPrefs();
  assert.equal(storage.getItem(PREFS_KEY), null);
  assert.deepEqual(clean(dataset), {});
  assert.equal(statusBar(), "#f2f2f7");
});

test("Hell/Dunkel faerbt die Statusleiste mit - und der Energiesparmodus geht vor", () => {
  setPrefs({ theme: "light" });
  assert.equal(dataset.theme, "light");
  assert.equal(statusBar(), "rgb(242 244 243)");

  setPrefs({ theme: "dark" });
  assert.equal(dataset.theme, "dark");
  assert.equal(statusBar(), "#000");

  setPrefs({ theme: "light" });
  setPowerSaving(true);
  assert.equal(dataset.theme, "dark");
  assert.equal(statusBar(), "#000");
  // Aus dem Energiesparmodus zurueck: wieder Hell, wie eingestellt - nicht "wie das System".
  setPowerSaving(false);
  assert.equal(dataset.theme, "light");
  assert.equal(head.children.filter((meta) => meta.id === STATUS_META_ID).length, 1);

  setPrefs({ theme: "system" });
  assert.equal(dataset.theme, undefined);
  assert.equal(statusBar(), "#f2f2f7");
  assert.equal(head.children.length, 2);
});

test("Ausblenden landet als Woerter in data-hide", () => {
  setPrefs({ hiddenAreas: ["team", "start"], hiddenStart: ["radar", "contacts"], tourProvider: false, tourGoalRing: false });
  assert.equal(dataset.hide, "area-start area-team start-radar start-contacts tour-provider tour-ring");
});

test("Meldungen laufen kuerzer oder laenger", () => {
  assert.equal(toastDuration(2800, "normal"), 2800);
  assert.ok(toastDuration(2800, "short") < 2800);
  assert.ok(toastDuration(2800, "long") > 4000);
});

/* --------------------------- Vor dem ersten Bild -------------------------- */

const CASES: Array<Partial<Preferences>> = [
  {},
  { accent: "rot" },
  { accent: "gruen", theme: "dark" },
  { theme: "light", tint: false, textSize: "l" },
  { glass: false, motion: false, contrast: true, accent: "graphit", mapDark: false },
  { hiddenAreas: ["map", "team"], hiddenStart: ["hero", "team"], tourCard: false, tourProvider: false, tourGoalRing: false },
];

for (const prefs of CASES) {
  test(`das Skript setzt dasselbe wie applyPrefs: ${JSON.stringify(prefs)}`, () => {
    setPrefs(prefs);
    const expected = clean({ ...dataset });
    const expectedBar = statusBar();

    freshPage();
    new Function(PREFS_SCRIPT)();
    assert.deepEqual(clean(dataset), expected);
    assert.equal(statusBar(), expectedBar);
  });
}

test("das Skript laesst den Energiesparmodus dunkel und legt keine zweite Farbe an", () => {
  storage.setItem(POWER_KEY, "save");
  storage.setItem(PREFS_KEY, JSON.stringify({ theme: "light", accent: "blau" }));
  new Function(POWER_SCRIPT + PREFS_SCRIPT)();
  assert.equal(dataset.theme, "dark");
  assert.equal(dataset.accent, "blau");
  assert.equal(statusBar(), "#000");
  assert.equal(head.children.length, 3);
});

test("das Skript ueberlebt kaputten oder gesperrten Speicher", () => {
  storage.setItem(PREFS_KEY, "nicht json");
  assert.doesNotThrow(() => new Function(PREFS_SCRIPT)());
  assert.deepEqual(clean(dataset), {});
  install("localStorage", undefined);
  assert.doesNotThrow(() => new Function(PREFS_SCRIPT)());
});
