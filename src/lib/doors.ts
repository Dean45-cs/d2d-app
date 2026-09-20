/**
 * Bearbeitungsstand einer Tuer.
 *
 * Eine Tuer ist ein Einfamilienhaus oder eine einzelne Klingel im
 * Mehrfamilienhaus. Bewusst ohne Datenbankbezug, damit Oberflaeche und
 * Abfragen dieselbe Regel benutzen.
 *
 * Der Kern: "nicht angetroffen" ist kein Ergebnis, sondern ein Versuch. An
 * zwei von drei Tueren macht beim ersten Mal niemand auf - wer die Tuer
 * danach abhakt, verschenkt den Grossteil seiner Kontaktchancen. Deshalb
 * zaehlt die App die Versuche, statt die Tuer zuzumachen.
 */

/** Nach so vielen erfolglosen Versuchen gilt eine Tuer als abgearbeitet. */
export const MAX_NOT_HOME_ATTEMPTS = 3;

export type DoorStatus =
  /** Noch nie jemand dran gewesen. */
  | "OPEN"
  /** Nicht angetroffen, es sind noch Versuche offen. */
  | "RETRY"
  /** Angetroffen, oder alle Versuche verbraucht. */
  | "DONE"
  /** Ausdruecklich gesperrt - nicht mehr anlaufen. */
  | "BLOCKED";

export interface DoorFacts {
  /** Zeitpunkt der Sperre, sonst null. */
  blocked_at: string | null;
  /** Erfolglose Versuche an dieser Tuer. */
  not_home_count: number;
  /** Eintraege, bei denen tatsaechlich jemand an der Tuer war. */
  met_count: number;
}

export function doorStatus(facts: DoorFacts): DoorStatus {
  if (facts.blocked_at) return "BLOCKED";
  if (facts.met_count > 0) return "DONE";
  if (facts.not_home_count >= MAX_NOT_HOME_ATTEMPTS) return "DONE";
  if (facts.not_home_count > 0) return "RETRY";
  return "OPEN";
}

/** Erledigt heisst: hier muss niemand mehr hin. */
export function doorFinished(facts: DoorFacts): boolean {
  const status = doorStatus(facts);
  return status === "DONE" || status === "BLOCKED";
}

/** "vor 5 Min.", "gestern 18:40", "Di, 16.09. 09:12" - kurz genug fuer die Plakette. */
export function whenLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "";

  const time = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 60) return minutes < 2 ? "gerade eben" : `vor ${minutes} Min.`;

  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (days === 0) return `heute ${time}`;
  if (days === 1) return `gestern ${time}`;
  if (days < 7) return `${date.toLocaleDateString("de-DE", { weekday: "short" })} ${time}`;
  return `${date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${time}`;
}
