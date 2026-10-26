import { ACCENT_IDS, DEFAULT_ACCENT, isAccent, type AccentId } from "./accents";

/*
 * Persoenliche Einstellungen - je Geraet, wie der Energiesparmodus.
 *
 * Alles steht als ein JSON-Objekt im localStorage (d2d.prefs), und zwar nur,
 * was vom Standard abweicht: ein neues Feld braucht keinen Umzug, ein
 * unbekanntes oder kaputtes faellt auf den Standard zurueck.
 *
 * Was man sieht (Farbe, Hell/Dunkel, Schriftgroesse, ausgeblendete
 * Bereiche), steht als Merkmal am <html> - gesetzt vom PREFS_SCRIPT noch vor
 * dem ersten Bild, damit nichts aufblitzt; die Styles in globals.css lesen
 * die Merkmale. Was die App tut (Ortung, Meldungen, Vorschlaege), lesen die
 * Komponenten ueber usePrefs().
 *
 * Laeuft im Browser; auf dem Server gilt immer DEFAULT_PREFS.
 */

export type ThemeChoice = "system" | "light" | "dark";
export type TextSize = "m" | "l" | "xl";
export type ToastSpeed = "short" | "normal" | "long";
export type TourLocation = "auto" | "tap";
/** Bereiche, die sich ausblenden lassen (Reiterleiste und Seitenleiste). */
export type AreaId = "start" | "map" | "team";
/** Abschnitte der Uebersicht bzw. "Meine Zahlen". */
export type StartSection =
  | "hero"
  | "history"
  | "radar"
  | "appointments"
  | "recalls"
  | "team"
  | "reasons"
  | "territories"
  | "provider"
  | "contacts";

export interface Preferences {
  /* Darstellung */
  theme: ThemeChoice;
  accent: AccentId;
  /** Grund, Linien und Glas mit einem Hauch der Akzentfarbe. */
  tint: boolean;
  textSize: TextSize;
  /** Glas mit Unschaerfe - aus: feste Flaechen. */
  glass: boolean;
  /** Animationen und Uebergaenge. */
  motion: boolean;
  /** Kraeftigere Linien und Schrift, Glas fest. */
  contrast: boolean;
  /** Reiterleiste schrumpft beim Rollen auf den aktiven Reiter. */
  tabbarShrink: boolean;

  /* Navigation und Startseite */
  hiddenAreas: AreaId[];
  hiddenStart: StartSection[];

  /* Klinken */
  tourOnlyOpen: boolean;
  tourNearbyHint: boolean;
  tourAppointments: boolean;
  tourProvider: boolean;
  tourDistance: boolean;
  tourGoalRing: boolean;
  tourCard: boolean;
  tourConfirm: boolean;
  tourLocation: TourLocation;

  /* Karte */
  mapAutoLocate: boolean;
  mapDark: boolean;

  /* Ziele und Rueckmeldungen */
  goalDoors: number;
  goalMet: number;
  goalSales: number;
  levelUp: boolean;
  toastSpeed: ToastSpeed;
  vibrate: boolean;

  /* Geraet */
  offlineWarm: boolean;
}

const DEFAULTS: Preferences = {
  theme: "system",
  accent: DEFAULT_ACCENT,
  tint: true,
  textSize: "m",
  glass: true,
  motion: true,
  contrast: false,
  tabbarShrink: true,
  hiddenAreas: [],
  hiddenStart: [],
  tourOnlyOpen: false,
  tourNearbyHint: true,
  tourAppointments: true,
  tourProvider: true,
  tourDistance: true,
  tourGoalRing: true,
  tourCard: true,
  tourConfirm: true,
  tourLocation: "auto",
  mapAutoLocate: true,
  mapDark: true,
  goalDoors: 20,
  goalMet: 5,
  goalSales: 1,
  levelUp: true,
  toastSpeed: "normal",
  vibrate: false,
  offlineWarm: true,
};
export const DEFAULT_PREFS: Readonly<Preferences> = Object.freeze(DEFAULTS);

/** Grenzen der Tagesziele - die Schritte im Regler. */
export const GOAL_LIMITS = {
  goalDoors: { min: 5, max: 150, step: 5 },
  goalMet: { min: 1, max: 40, step: 1 },
  goalSales: { min: 1, max: 10, step: 1 },
} as const;

export const AREA_IDS: readonly AreaId[] = ["start", "map", "team"];
export const START_SECTIONS: readonly StartSection[] = [
  "hero",
  "history",
  "radar",
  "appointments",
  "recalls",
  "team",
  "reasons",
  "territories",
  "provider",
  "contacts",
];

/** Wo das Geraet die Einstellungen ablegt (localStorage). */
export const PREFS_KEY = "d2d.prefs";
const PREFS_EVENT = "d2d-prefs";
/**
 * Eigenes meta-Tag fuer die Farbe der Statusleiste, ganz vorn im <head> (das
 * erste passende gilt). Teilen sich Energiesparmodus und "Hell/Dunkel" - die
 * Tags von Next.js gehoeren React und werden nicht angefasst.
 */
export const STATUS_META_ID = "d2d-power-color";
/**
 * Schwarz im Dunkeln: bewusst "#000" statt "#000000" - React ordnet meta-Tags
 * beim Laden nach ihrem Inhalt zu und hielte unseres sonst fuer das dunkle
 * aus layout.tsx. Aus demselben Grund steht Hell als rgb() da.
 */
export const DARK_STATUS = "#000";

/* ------------------------------ Pruefen -------------------------------- */

const CHOICES: { [K in keyof Preferences]?: readonly string[] } = {
  theme: ["system", "light", "dark"],
  textSize: ["m", "l", "xl"],
  toastSpeed: ["short", "normal", "long"],
  tourLocation: ["auto", "tap"],
};

function clampGoal(key: keyof typeof GOAL_LIMITS, value: unknown): number {
  const { min, max } = GOAL_LIMITS[key];
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : DEFAULT_PREFS[key];
}

/** Aus beliebigem JSON gueltige Einstellungen - was nicht passt, gilt als Standard. */
export function sanitizePrefs(input: unknown): Preferences {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const prefs = { ...DEFAULT_PREFS, hiddenAreas: [], hiddenStart: [] } as Preferences;
  for (const key of Object.keys(DEFAULT_PREFS) as Array<keyof Preferences>) {
    const value = raw[key];
    if (value === undefined) continue;
    const fallback = DEFAULT_PREFS[key];
    if (key === "accent") {
      if (isAccent(value)) prefs.accent = value;
    } else if (key === "hiddenAreas") {
      if (Array.isArray(value)) prefs.hiddenAreas = AREA_IDS.filter((id) => value.includes(id));
    } else if (key === "hiddenStart") {
      if (Array.isArray(value)) prefs.hiddenStart = START_SECTIONS.filter((id) => value.includes(id));
    } else if (key === "goalDoors" || key === "goalMet" || key === "goalSales") {
      prefs[key] = clampGoal(key, value);
    } else if (typeof fallback === "boolean") {
      if (typeof value === "boolean") (prefs as unknown as Record<string, unknown>)[key] = value;
    } else if (CHOICES[key]?.includes(value as string)) {
      (prefs as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return prefs;
}

/** Nur was vom Standard abweicht - so bleibt der Speicher klein und neue Standards greifen. */
function compact(prefs: Preferences): Partial<Preferences> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_PREFS) as Array<keyof Preferences>) {
    const value = prefs[key];
    const fallback = DEFAULT_PREFS[key];
    const same = Array.isArray(value) ? value.length === 0 : value === fallback;
    if (!same) out[key] = value;
  }
  return out;
}

/* ------------------------------ Lesen ---------------------------------- */

let cache: { raw: string | null; prefs: Preferences } | null = null;

function storedRaw(): string | null {
  try {
    return window.localStorage.getItem(PREFS_KEY);
  } catch {
    return null;
  }
}

/** Die Einstellungen dieses Geraets - dasselbe Objekt, solange sich nichts aendert (useSyncExternalStore). */
export function readPrefs(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFS as Preferences;
  const raw = storedRaw();
  if (cache && cache.raw === raw) return cache.prefs;
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  cache = { raw, prefs: sanitizePrefs(parsed) };
  return cache.prefs;
}

/** Eine einzelne Einstellung - fuer Code ausserhalb von React. */
export function pref<K extends keyof Preferences>(key: K): Preferences[K] {
  return readPrefs()[key];
}

/* ------------------------------ Schreiben ------------------------------ */

/** Einstellungen aendern - wirkt sofort auf alles, was zuhoert, auch auf das Aussehen. */
export function setPrefs(patch: Partial<Preferences>): Preferences {
  const next = sanitizePrefs({ ...readPrefs(), ...patch });
  const value = JSON.stringify(compact(next));
  try {
    if (value === "{}") window.localStorage.removeItem(PREFS_KEY);
    else window.localStorage.setItem(PREFS_KEY, value);
    cache = null;
  } catch {
    // Privater Modus: dann gilt die Einstellung bis zum Neuladen.
    cache = { raw: storedRaw(), prefs: next };
  }
  applyPrefs(next);
  window.dispatchEvent(new Event(PREFS_EVENT));
  return next;
}

/** Alles auf Anfang. */
export function resetPrefs(): Preferences {
  try {
    window.localStorage.removeItem(PREFS_KEY);
  } catch {
    // Ohne Speicher gab es auch nichts Gespeichertes.
  }
  cache = { raw: null, prefs: DEFAULT_PREFS as Preferences };
  applyPrefs(DEFAULT_PREFS as Preferences);
  window.dispatchEvent(new Event(PREFS_EVENT));
  return DEFAULT_PREFS as Preferences;
}

/** Meldet jeden Wechsel - auch aus einem anderen Fenster der App. */
export function onPrefsChange(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PREFS_KEY && event.key !== null) return;
    cache = null;
    applyPrefs(readPrefs());
    listener();
  };
  window.addEventListener(PREFS_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PREFS_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/* ------------------------------ Aussehen ------------------------------- */

/** Die Merkmale am <html>; undefined entfernt eines. Muss zu PREFS_SCRIPT passen. */
export function prefAttributes(prefs: Preferences): Record<string, string | undefined> {
  const hide = [
    ...prefs.hiddenAreas.map((id) => `area-${id}`),
    ...prefs.hiddenStart.map((id) => `start-${id}`),
    ...(prefs.tourProvider ? [] : ["tour-provider"]),
    ...(prefs.tourCard ? [] : ["tour-card"]),
    ...(prefs.tourGoalRing ? [] : ["tour-ring"]),
  ];
  return {
    accent: prefs.accent === DEFAULT_ACCENT ? undefined : prefs.accent,
    tint: prefs.tint ? undefined : "off",
    text: prefs.textSize === "m" ? undefined : prefs.textSize,
    glass: prefs.glass ? undefined : "off",
    motion: prefs.motion ? undefined : "off",
    contrast: prefs.contrast ? "more" : undefined,
    mapDark: prefs.mapDark ? undefined : "off",
    hide: hide.length > 0 ? hide.join(" ") : undefined,
  };
}

/**
 * Hell oder dunkel: der Energiesparmodus ist immer dunkel, sonst gilt die
 * Wahl (Automatisch = wie das System, kein Merkmal).
 */
export function themeFor(theme: ThemeChoice, saving: boolean): "light" | "dark" | undefined {
  if (saving) return "dark";
  return theme === "system" ? undefined : theme;
}

/** Hell/Dunkel samt Statusleiste nach Energiesparmodus und Einstellung setzen. */
export function applyTheme(theme: ThemeChoice = readPrefs().theme): void {
  const root = document.documentElement;
  const mode = themeFor(theme, root.dataset.power === "save");
  if (mode) root.dataset.theme = mode;
  else delete root.dataset.theme;

  let meta = document.getElementById(STATUS_META_ID) as HTMLMetaElement | null;
  if (!mode) {
    meta?.remove();
    return;
  }
  if (!meta) {
    meta = document.createElement("meta");
    meta.id = STATUS_META_ID;
    meta.name = "theme-color";
  }
  meta.content = mode === "dark" ? DARK_STATUS : lightStatus();
  if (document.head.firstChild !== meta) document.head.prepend(meta);
}

/** Der helle Seitengrund des Themas als rgb() - die Statusleiste geht in ihn ueber. */
function lightStatus(): string {
  const fallback = "rgb(242 244 243)";
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    const match = /^#([0-9a-f]{6})$/i.exec(value);
    if (!match) return fallback;
    const n = parseInt(match[1], 16);
    return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255})`;
  } catch {
    return fallback;
  }
}

/** Alle Merkmale setzen - nach jeder Aenderung und nach einem Seitenwechsel. */
export function applyPrefs(prefs: Preferences = readPrefs()): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(prefAttributes(prefs))) {
    if (value === undefined) delete root.dataset[name];
    else root.dataset[name] = value;
  }
  applyTheme(prefs.theme);
}

/**
 * Setzt die Merkmale vor dem ersten Bild (im <body> des Wurzel-Layouts,
 * nach POWER_SCRIPT). Von Hand geschrieben, weil es vor jedem Bundle laeuft;
 * scripts/tests/preferences.test.ts prueft, dass es dasselbe tut wie applyPrefs.
 */
export const PREFS_SCRIPT = [
  "try{",
  `var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"{}")||{},d=document.documentElement,s=d.dataset,h=[],a,i;`,
  "function L(x,k){return Array.isArray(x)?k.filter(function(v){return x.indexOf(v)>=0}):[]}",
  `if(p.accent!==${JSON.stringify(DEFAULT_ACCENT)}&&${JSON.stringify(ACCENT_IDS)}.indexOf(p.accent)>=0)s.accent=p.accent;`,
  'if(p.tint===false)s.tint="off";',
  'if(p.textSize==="l"||p.textSize==="xl")s.text=p.textSize;',
  'if(p.glass===false)s.glass="off";',
  'if(p.motion===false)s.motion="off";',
  'if(p.contrast===true)s.contrast="more";',
  'if(p.mapDark===false)s.mapDark="off";',
  `a=L(p.hiddenAreas,${JSON.stringify(AREA_IDS)});for(i=0;i<a.length;i++)h.push("area-"+a[i]);`,
  `a=L(p.hiddenStart,${JSON.stringify(START_SECTIONS)});for(i=0;i<a.length;i++)h.push("start-"+a[i]);`,
  'if(p.tourProvider===false)h.push("tour-provider");',
  'if(p.tourCard===false)h.push("tour-card");',
  'if(p.tourGoalRing===false)h.push("tour-ring");',
  'if(h.length)s.hide=h.join(" ");',
  // Hell/Dunkel nur ohne Energiesparmodus - der setzt (POWER_SCRIPT) schon Dunkel samt Statusleiste.
  'if(s.power!=="save"&&(p.theme==="light"||p.theme==="dark")){',
  "s.theme=p.theme;",
  `var m=document.createElement("meta");m.id=${JSON.stringify(STATUS_META_ID)};m.name="theme-color";`,
  `m.content=p.theme==="dark"?${JSON.stringify(DARK_STATUS)}:"rgb(242 244 243)";`,
  'if(p.theme==="light"){try{var b=getComputedStyle(d).getPropertyValue("--bg").trim();',
  'if(/^#[0-9a-f]{6}$/i.test(b)){var n=parseInt(b.slice(1),16);m.content="rgb("+(n>>16&255)+" "+(n>>8&255)+" "+(n&255)+")"}}catch(e){}}',
  "document.head.prepend(m)}",
  "}catch(e){}",
].join("");

/* ------------------------------ Ziele ---------------------------------- */

/** Die eigenen Tagesziele - Ring beim Klinken und unter "Erfolge". */
export function dailyTargets(prefs: Preferences = readPrefs()): Record<"doors" | "met" | "sales", number> {
  return { doors: prefs.goalDoors, met: prefs.goalMet, sales: prefs.goalSales };
}

/** Anzeigedauer eines Toasts nach Einstellung. */
export function toastDuration(base: number, speed: ToastSpeed = readPrefs().toastSpeed): number {
  return Math.round(base * (speed === "short" ? 0.65 : speed === "long" ? 1.8 : 1));
}

/** Kurz vibrieren - nur wenn eingeschaltet und das Geraet es kann (Android; iPhone kann es im Browser nicht). */
export function buzz(pattern: number | number[] = 12): void {
  if (!pref("vibrate")) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Kein Vibrationsmotor oder vom Browser gesperrt - dann eben still.
  }
}

/** Kann dieses Geraet vibrieren? Fuer die Einstellung - sonst steht sie gar nicht da. */
export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}
