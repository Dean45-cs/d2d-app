import { bellKey } from "@/lib/doorbells";
import type { ProviderInfo } from "@/lib/energy/provider";
import type { LevelFeedback } from "@/lib/level-feedback";
import type { LocalVisits } from "@/lib/tour-draft";
import type { VisitOutcome } from "@/lib/types";

/*
 * Gemeinsame Typen und kleine Helfer der Tuer-Erfassung - ohne React.
 */

export type TerritoryLite = {
  id: number;
  name: string;
  city: string;
  postal_code: string;
  provider: ProviderInfo | null;
};

export type EnergyType = "STROM" | "GAS" | "BEIDES";

export const PRODUCTS: Array<{ value: EnergyType; label: string }> = [
  { value: "STROM", label: "Strom" },
  { value: "GAS", label: "Gas" },
  { value: "BEIDES", label: "Strom + Gas" },
];

/**
 * Eine Klingel, so wie die Oberflaeche sie braucht. Ein Schild, das gerade
 * erst - womoeglich ohne Netz - angelegt wurde, hat noch keine ID vom Server.
 */
export interface Bell {
  id: number | null;
  label: string;
  floor: string;
  visit_count: number;
  not_home_count: number;
  met_count: number;
  last_outcome: VisitOutcome | null;
  last_reason_icon: string | null;
  last_visit_at: string | null;
  last_visit_user: string | null;
  /** Wer zuletzt hier geklingelt hat - dazu gehoert das Profilbild. */
  last_visit_user_id: number | null;
  blocked_at: string | null;
  blocked_by_name: string | null;
}

/** Eine frisch angelegte Klingel - noch nichts passiert. */
export const NEW_BELL = {
  id: null,
  visit_count: 0,
  not_home_count: 0,
  met_count: 0,
  last_outcome: null,
  last_reason_icon: null,
  last_visit_at: null,
  last_visit_user: null,
  last_visit_user_id: null,
  blocked_at: null,
  blocked_by_name: null,
} as const;

/** Die Tuer eines gespeicherten Eintrags - fuer "Rückgängig". */
export interface SavedDoor {
  streetId: number;
  number: string;
  label: string;
  /** "Nicht da" oder jemand angetroffen - was die Zaehlung zuruecknimmt. */
  notHome: boolean;
}

export type SaveResult =
  | {
      status: "saved";
      id: number;
      /** Die Tuer, an der gespeichert wurde - fuer "Rückgängig". */
      door: SavedDoor;
      nextBell: string | null;
      pickBell?: boolean;
      progression?: LevelFeedback;
    }
  | {
      status: "queued";
      nextBell: string | null;
      pickBell?: boolean;
      /** Gemerkt, weil die Anmeldung abgelaufen ist - nach dem neuen Anmelden wird nachgesendet. */
      loggedOut?: boolean;
    }
  | { status: "error" };

export type SheetName =
  | "bells"
  | "street"
  | "reason"
  | "appointment"
  | "sale"
  | "house"
  | "block"
  | "day"
  | "number";

export const EMPTY_VISITS: Map<string, LocalVisits> = new Map();

/** Schluessel einer einzelnen Klingel in den Merklisten dieser Sitzung. */
export function bellSlot(houseKey: string, label: string): string {
  return `${houseKey}:${bellKey(label)}`;
}

/** Schluessel eines Hauses in den Merklisten dieser Sitzung. */
export function doneKey(streetId: number, number: string): string {
  return `${streetId}:${number.trim().replace(/\s+/g, "").toLowerCase()}`;
}

/** Zwei Hausnummern meinen dasselbe Haus - Leerzeichen und Grossschreibung egal. */
export function sameNumber(a: string, b: string): boolean {
  return a.trim().replace(/\s+/g, "").toLowerCase() === b.trim().replace(/\s+/g, "").toLowerCase();
}

/** Zeitpunkt eines Eintrags ("2026-09-27 17:52:10", UTC) in Ortszeit: "17:52", "gestern 17:52", "Mo. 17:52", "21.09.". */
export function formatTime(value: string, now = new Date()): string {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  const time = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  // Nur heute genuegt die Uhrzeit - sonst sahe ein Eintrag von gestern aus wie von eben.
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return `gestern ${time}`;
  if (days < 7) return `${date.toLocaleDateString("de-DE", { weekday: "short" })} ${time}`;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

/** Naechste Hausnummern fuer Strassen ohne Liste: +1 und +2. */
export function numberSuggestions(last: string): string[] {
  const match = /^(\d+)/.exec(last.trim());
  if (!match) return [];
  const n = Number(match[1]);
  return [String(n + 1), String(n + 2)];
}
