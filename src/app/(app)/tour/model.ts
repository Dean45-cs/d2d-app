import { bellKey } from "@/lib/doorbells";
import { dayLabel, doorStatus, whenLabel, type DoorFacts } from "@/lib/doors";
import type { ProviderInfo } from "@/lib/energy/provider";
import type { LevelFeedback } from "@/lib/level-feedback";
import { firstName } from "@/lib/ranking";
import type { LocalLast, LocalVisits } from "@/lib/tour-draft";
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
  /** Nicht (mehr) in der Tour - nur wegen eigener Termine dabei. Dort schlaegt "in der Naehe" nichts vor. */
  appointmentsOnly: boolean;
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
  last_reason_label: string | null;
  last_reason_icon: string | null;
  /** Letzter Abschluss an dieser Klingel - sperrt nichts. */
  last_sale_at: string | null;
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
  last_reason_label: null,
  last_reason_icon: null,
  last_sale_at: null,
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
      progression?: LevelFeedback;
    }
  | {
      status: "queued";
      /** Gemerkt, weil die Anmeldung abgelaufen ist - nach dem neuen Anmelden wird nachgesendet. */
      loggedOut?: boolean;
    }
  | { status: "error" };

export type SheetName =
  | "street"
  | "reason"
  | "appointment"
  | "sale"
  | "house"
  | "block"
  | "day"
  | "card";

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

/** Was an einer Tuer zuletzt war - vom Server, oder eben erst hier erfasst. */
export interface DoorLast {
  outcome: VisitOutcome | null;
  reasonLabel: string | null;
  reasonIcon: string | null;
  at: string | null;
  userId: number | null;
  userName: string | null;
}

/** Der lokal erfasste Eintrag gewinnt, bis der Server ihn selbst kennt. */
export function doorLast(
  server: {
    last_outcome: VisitOutcome | null;
    last_reason_label: string | null;
    last_reason_icon: string | null;
    last_visit_at: string | null;
    last_visit_user: string | null;
    last_visit_user_id: number | null;
  },
  local: LocalLast | null,
  nameOf: (userId: number) => string | null,
): DoorLast {
  if (local) {
    return {
      outcome: local.outcome,
      reasonLabel: local.reasonLabel,
      reasonIcon: local.reasonIcon,
      at: local.at,
      userId: local.userId,
      userName: nameOf(local.userId),
    };
  }
  return {
    outcome: server.last_outcome,
    reasonLabel: server.last_reason_label,
    reasonIcon: server.last_reason_icon,
    at: server.last_visit_at,
    userId: server.last_visit_user_id,
    userName: server.last_visit_user,
  };
}

/** "Abschluss am 12.03.2026", "Abschluss heute 14:20". */
export function saleText(at: string): string {
  const day = dayLabel(at);
  return /^\d/.test(day) ? `Abschluss am ${day}` : `Abschluss ${day}`;
}

/**
 * Der Stand einer Tuer in Worten, so wie ihn die Liste zeigt: was zuletzt
 * war (Titel) und wer wann (Zeile darunter). Ein frueherer Abschluss bleibt
 * sichtbar, auch wenn danach noch jemand da war - etwa nach einem Umzug.
 */
export function doorText(
  facts: DoorFacts,
  last: DoorLast,
  saleAt: string | null,
  blockedBy: string | null,
): { title: string; meta: string } {
  if (doorStatus(facts) === "BLOCKED") {
    return { title: "Gesperrt", meta: blockedBy ? `von ${blockedBy}` : "Hier nicht klingeln" };
  }
  const who = last.at ? [last.userName ? firstName(last.userName) : "Jemand", whenLabel(last.at)].join(" · ") : "";
  const earlierSale = saleAt && last.outcome !== "SALE" ? saleText(saleAt) : null;
  const title =
    last.outcome === null
      ? "Noch nicht besucht"
      : last.outcome === "NOT_HOME"
        ? facts.not_home_count > 1
          ? `Nicht angetroffen · ${facts.not_home_count}×`
          : "Nicht angetroffen"
        : last.outcome === "MET_NO_SALE"
          ? (last.reasonLabel ?? "Kein Abschluss")
          : last.outcome === "APPOINTMENT"
            ? "Termin vereinbart"
            : last.at
              ? saleText(last.at)
              : "Abschluss";
  return { title, meta: [earlierSale, who].filter(Boolean).join(" · ") };
}

