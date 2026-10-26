/**
 * Akku schonen - ein langer Tag an der Tuer soll mit einer Ladung auskommen.
 *
 * Immer (ohne dass jemand etwas einstellt):
 *  - Die Ortung laeuft nur, solange die App sichtbar ist UND bedient wird.
 *    Ruehrt zwei Minuten niemand das Handy an (Gespraech an der Tuer), ruht
 *    sie; der naechste Tipp weckt sie wieder (whileActive).
 *  - Zeitgeber fragen den Server nur, solange die App sichtbar ist.
 *
 * Super-Energiesparmodus (Schalter im Profil, gilt je Geraet): schaltet
 * alles ab, was Akku kostet und an der Tuer nicht gebraucht wird -
 * dunkle Oberflaeche (spart auf OLED-Displays am meisten), kein Glas, keine
 * Animationen, Standort nur auf Antippen statt dauerhaft, Karten in
 * einfacher Aufloesung ohne Satellitenbild, kein Nachfragen im Takt.
 * Erfassen, Nachsenden und Termine bleiben unveraendert.
 *
 * Laeuft ausschliesslich im Browser.
 */

import { DARK_STATUS, STATUS_META_ID, applyTheme } from "./preferences";

/** Wo das Geraet sich den Modus merkt (localStorage). */
export const POWER_KEY = "d2d.power";
const POWER_EVENT = "d2d-power";
/** So lange darf niemand die App bedienen, bevor die Ortung ruht. */
export const IDLE_MS = 2 * 60 * 1000;
/** Im Energiesparmodus gilt ein Standort so lange - danach koennte man schon woanders stehen. */
export const SAVE_FIX_MS = 2 * 60 * 1000;
/** Statusleiste im Energiesparmodus: so schwarz wie die Oberflaeche (preferences.ts teilt das Tag). */
const SAVE_THEME_COLOR = DARK_STATUS;
const COLOR_META_ID = STATUS_META_ID;

/**
 * Setzt den Modus vor dem ersten Bild (im <body> des Wurzel-Layouts) - sonst
 * blitzte die helle Oberflaeche kurz auf. Muss zu applyPowerSaving passen.
 */
export const POWER_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(POWER_KEY)})==="save"){var d=document.documentElement;d.dataset.power="save";d.dataset.theme="dark";var m=document.createElement("meta");m.id=${JSON.stringify(COLOR_META_ID)};m.name="theme-color";m.content=${JSON.stringify(SAVE_THEME_COLOR)};document.head.prepend(m)}}catch(e){}`;

/** Was das Geraet gespeichert hat. */
export function storedPowerSaving(): boolean {
  try {
    return window.localStorage.getItem(POWER_KEY) === "save";
  } catch {
    return false;
  }
}

/**
 * Ist der Modus gerade an? Liest die Seite, nicht den Speicher - das ist
 * billig und stimmt schon vor React (POWER_SCRIPT). Effekte fragen hier
 * nach statt bei usePowerSaving: das meldet beim ersten Durchlauf nach dem
 * Laden noch den Stand des Servers ("aus").
 */
export function powerSaving(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.power === "save";
}

/**
 * Oberflaeche umstellen: Merkmal fuer die Styles, dunkles Thema, Farbe der
 * Statusleiste. Aus heisst: wieder Hell/Dunkel wie eingestellt (Einstellungen).
 */
export function applyPowerSaving(on: boolean): void {
  const root = document.documentElement;
  if (on) root.dataset.power = "save";
  else delete root.dataset.power;
  applyTheme();
}

/** Modus ein- oder ausschalten - wirkt sofort auf alles, was zuhoert. */
export function setPowerSaving(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(POWER_KEY, "save");
    else window.localStorage.removeItem(POWER_KEY);
  } catch {
    // Privater Modus: dann gilt der Schalter nur bis zum Neuladen.
  }
  applyPowerSaving(on);
  window.dispatchEvent(new Event(POWER_EVENT));
}

/** Meldet jeden Wechsel - auch aus einem anderen Fenster der App. */
export function onPowerChange(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== POWER_KEY) return;
    applyPowerSaving(event.newValue === "save");
    listener();
  };
  window.addEventListener(POWER_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(POWER_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Bedienen heisst: tippen, tippen auf der Tastatur, mit dem Mausrad rollen. */
const ACTIVITY = ["pointerdown", "keydown", "wheel"] as const;

/**
 * Laesst etwas Teures (die Ortung) nur laufen, solange die App sichtbar ist
 * und bedient wird: `start` sofort und nach jeder Pause beim naechsten Tipp,
 * `stop` beim Wechsel in den Hintergrund und nach `idleMs` ohne Bedienung.
 * Gibt eine Funktion zum Aufraeumen zurueck (die auch stoppt).
 */
export function whileActive(start: () => void, stop: () => void, idleMs = IDLE_MS): () => void {
  let running = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let lastActivity = 0;

  const pause = () => {
    clearTimeout(idle);
    if (!running) return;
    running = false;
    stop();
  };
  const resume = () => {
    if (document.visibilityState === "hidden") return pause();
    lastActivity = Date.now();
    clearTimeout(idle);
    idle = setTimeout(pause, idleMs);
    if (running) return;
    running = true;
    start();
  };
  // Beim Rollen kommen viele Ereignisse - eins je Sekunde reicht zum Wachhalten.
  const onActivity = () => {
    if (running && Date.now() - lastActivity < 1000) return;
    resume();
  };
  const onVisibility = () => (document.visibilityState === "hidden" ? pause() : resume());

  for (const type of ACTIVITY) window.addEventListener(type, onActivity, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  resume();

  return () => {
    for (const type of ACTIVITY) window.removeEventListener(type, onActivity, { capture: true });
    document.removeEventListener("visibilitychange", onVisibility);
    pause();
  };
}
