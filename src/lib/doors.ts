/**
 * Bearbeitungsstand einer Tuer.
 *
 * Eine Tuer ist ein Einfamilienhaus oder eine einzelne Klingel im
 * Mehrfamilienhaus. Bewusst ohne Datenbankbezug, damit Oberflaeche und
 * Abfragen dieselbe Regel benutzen.
 *
 * Kein Ergebnis macht eine Tuer zu: "nicht angetroffen" ist nur ein Versuch,
 * und auch wer schon angetroffen wurde - selbst mit Abschluss -, kann wieder
 * angetroffen werden. Leute ziehen um, Vertraege laufen aus. Zu ist nur, was
 * jemand ausdruecklich sperrt.
 */

export type DoorStatus =
  /** Noch nie jemand dran gewesen. */
  | "OPEN"
  /** Bisher nur nicht angetroffen - beliebig oft. */
  | "RETRY"
  /** Jemand angetroffen (Gespraech, Termin oder Abschluss). */
  | "MET"
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
  if (facts.met_count > 0) return "MET";
  if (facts.not_home_count > 0) return "RETRY";
  return "OPEN";
}

/**
 * Offen heisst: hier wurde noch niemand angetroffen. Dorthin fuehrt "In
 * meiner Nähe", und das zaehlt "offen". Erfassen laesst sich jede Tuer, die
 * nicht gesperrt ist - offen oder nicht.
 */
export function doorOpen(facts: DoorFacts): boolean {
  const status = doorStatus(facts);
  return status === "OPEN" || status === "RETRY";
}

/** "vor 5 Min.", "gestern 18:40", "Di, 16.09. 09:12", "14.05.2024" - kurz genug fuer die Plakette. */
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
  // Aus einem anderen Jahr: das Jahr statt der Uhrzeit - "14.05." saehe aus wie von diesem Mai.
  if (date.getFullYear() !== today.getFullYear()) {
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  return `${date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${time}`;
}

/**
 * Tag eines Eintrags fuer "Abschluss am …": heute und gestern mit Uhrzeit,
 * sonst das volle Datum - ein Abschluss kann Jahre her sein, und genau das
 * soll man an der Tuer sehen (vielleicht wohnt dort inzwischen jemand anders).
 */
export function dayLabel(value: string | null, now = new Date()): string {
  if (!value) return "";
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "";

  const time = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (days === 0) return `heute ${time}`;
  if (days === 1) return `gestern ${time}`;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
