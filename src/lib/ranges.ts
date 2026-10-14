import { berlinMidnight } from "./format";

/**
 * Zeitraum-Definitionen. Bewusst ohne "use client", damit sowohl die
 * Server-Komponente als auch der Client-Umschalter darauf zugreifen koennen.
 */
export const RANGES = [
  { key: "1", label: "Heute" },
  { key: "7", label: "7 Tage" },
  { key: "30", label: "30 Tage" },
  { key: "all", label: "Gesamt" },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

/**
 * Wandelt den Zeitraum in einen SQL-tauglichen Startzeitpunkt um. "Heute"
 * beginnt um Mitternacht in Berlin, nicht in UTC - sonst zaehlte kurz nach
 * Mitternacht noch der Vortag mit.
 */
export function rangeToSince(key: RangeKey, now = new Date()): string | undefined {
  if (key === "all") return undefined;
  return berlinMidnight(Number(key) - 1, now);
}

export function parseRange(value: string | undefined, fallback: RangeKey = "7"): RangeKey {
  return (RANGES.some((r) => r.key === value) ? value : fallback) as RangeKey;
}

/**
 * Der gleich lange Zeitraum davor - "letzte 7 Tage" gegen die 7 Tage davor.
 * Damit laesst sich zeigen, ob man Plaetze gutgemacht hat.
 */
export function previousRange(key: RangeKey, now = new Date()): { since: string; until: string } | null {
  const since = rangeToSince(key, now);
  if (!since) return null;
  const days = Number(key);
  return { since: berlinMidnight(2 * days - 1, now), until: since };
}
