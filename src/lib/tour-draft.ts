/**
 * Zwischenstand der Tuererfassung im Geraet.
 *
 * Haustyp, frisch angelegte Klingelschilder und die in dieser Sitzung
 * erfassten Tueren kennt der Server erst, wenn die Warteschlange durch ist.
 * Laedt die App vorher neu - im Treppenhaus kein Einzelfall, das Handy raeumt
 * Hintergrund-Tabs gern ab -, waere der Stand sonst weg: das Klingelbrett
 * saehe leer aus und man wuerde dieselben Parteien ein zweites Mal
 * durchklingeln.
 *
 * Die Warteschlange traegt derweil die Daten selbst; hier liegt nur, was die
 * Oberflaeche zum Anzeigen braucht.
 *
 * Laeuft ausschliesslich im Browser.
 */

import type { DoorbellInput } from "./doorbells";
import type { BuildingType } from "./types";

const STORAGE_KEY = "d2d_tour_draft";

/** Nach einem halben Tag zaehlt nur noch, was der Server weiss. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface TourDraft {
  /** Haustyp je Haus, Schluessel ist "strassenId:hausnummer". */
  types: Array<[string, BuildingType]>;
  /** Lokal angelegte Klingelschilder je Haus. */
  bells: Array<[string, DoorbellInput[]]>;
  /** Erfasste Haeuser und Klingeln dieser Sitzung. */
  doneHouses: string[];
  doneBells: string[];
}

export function readDraft(): TourDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TourDraft & { savedAt?: number };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      types: Array.isArray(parsed.types) ? parsed.types : [],
      bells: Array.isArray(parsed.bells) ? parsed.bells : [],
      doneHouses: Array.isArray(parsed.doneHouses) ? parsed.doneHouses : [],
      doneBells: Array.isArray(parsed.doneBells) ? parsed.doneBells : [],
    };
  } catch {
    // Privater Modus oder beschaedigter Eintrag: dann eben ohne Zwischenstand.
    return null;
  }
}

export function writeDraft(draft: TourDraft): void {
  if (typeof window === "undefined") return;
  const empty =
    draft.types.length === 0 &&
    draft.bells.length === 0 &&
    draft.doneHouses.length === 0 &&
    draft.doneBells.length === 0;
  try {
    if (empty) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Speicher voll oder gesperrt - der Zwischenstand ist ein Komfort,
    // die Daten selbst liegen in der Warteschlange.
  }
}
