import type { LevelProgress } from "./levels";
import { pref } from "./preferences";

/** Only a confirmed server response may change the displayed XP balance. */
export interface LevelFeedback {
  progress: LevelProgress;
  awardedXp: number;
  previousLevel: number;
  levelUp: boolean;
}

/** Wo das Geraet sich merkt, dass die XP-Hinweise aus sind (localStorage). */
export const XP_HINTS_KEY = "d2d.xpHints";
const XP_HINTS_EVENT = "d2d-xp-hints";

/**
 * Nennen die Meldungen nach einem Besuch die XP? Je Geraet im Profil
 * abschaltbar; solange nichts gespeichert ist, sind sie an. Der Level-Ring und
 * ein Levelaufstieg bleiben davon unberuehrt.
 */
export function xpHintsOn(): boolean {
  try {
    return window.localStorage.getItem(XP_HINTS_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Hinweise ein- oder ausschalten - wirkt sofort auf alles, was zuhoert. */
export function setXpHints(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(XP_HINTS_KEY);
    else window.localStorage.setItem(XP_HINTS_KEY, "off");
  } catch {
    // Privater Modus: dann gilt der Schalter nur bis zum Neuladen.
  }
  window.dispatchEvent(new Event(XP_HINTS_EVENT));
}

/** Meldet jeden Wechsel - auch aus einem anderen Fenster der App. */
export function onXpHintsChange(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === XP_HINTS_KEY) listener();
  };
  window.addEventListener(XP_HINTS_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(XP_HINTS_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function levelFeedbackText(feedback?: LevelFeedback): string {
  if (!feedback || feedback.awardedXp <= 0) return "";
  // Den Aufstieg nennen, solange er unter Einstellungen -> Ziele nicht abgeschaltet ist.
  const levelUp = feedback.levelUp && pref("levelUp") ? `Level ${feedback.progress.level} erreicht!` : "";
  if (!xpHintsOn()) return levelUp;
  return `+${feedback.awardedXp.toLocaleString("de-DE")} XP${levelUp ? ` · ${levelUp}` : ""}`;
}
