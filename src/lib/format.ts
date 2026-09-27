/*
 * Datum und Uhrzeit fuer die Oberflaeche.
 *
 * Der Server laeuft in UTC, das Team in Deutschland - was "heute" und "guten
 * Abend" ist, rechnen wir deshalb ausdruecklich in Berliner Zeit.
 */

const ZONE = "Europe/Berlin";

/** "Sonntag, 27. September" */
export function todayLong(now = new Date()): string {
  return now.toLocaleDateString("de-DE", {
    timeZone: ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "Guten Morgen" / "Guten Tag" / "Guten Abend" nach Berliner Uhrzeit. */
export function greeting(now = new Date()): string {
  const hour = Number(
    now.toLocaleString("de-DE", { timeZone: ZONE, hour: "2-digit", hour12: false }),
  );
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}

/** Zeitstempel aus SQLite ("2026-09-27 17:52:10", UTC) als "27.09., 19:52". */
export function sqlDateTime(value: string): string {
  return new Date(`${value.replace(" ", "T")}Z`).toLocaleString("de-DE", {
    timeZone: ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Nur die Uhrzeit eines SQLite-Zeitstempels: "19:52". */
export function sqlTime(value: string): string {
  return new Date(`${value.replace(" ", "T")}Z`).toLocaleTimeString("de-DE", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Tag eines SQLite-Zeitstempels in Berliner Zeit: "2026-09-27". */
export function sqlDay(value: string): string {
  return new Date(`${value.replace(" ", "T")}Z`).toLocaleDateString("sv-SE", { timeZone: ZONE });
}

/** "Heute", "Gestern" oder "Freitag, 25. September". */
export function dayHeading(day: string, now = new Date()): string {
  const today = now.toLocaleDateString("sv-SE", { timeZone: ZONE });
  const yesterday = new Date(now.getTime() - 86_400_000).toLocaleDateString("sv-SE", {
    timeZone: ZONE,
  });
  if (day === today) return "Heute";
  if (day === yesterday) return "Gestern";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", {
    timeZone: ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
