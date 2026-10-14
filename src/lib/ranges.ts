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

/** Wandelt den Zeitraum in ein SQL-taugliches Startdatum um. */
export function rangeToSince(key: RangeKey): string | undefined {
  if (key === "all") return undefined;
  const days = key === "1" ? 0 : Number(key) - 1;
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export function parseRange(value: string | undefined, fallback: RangeKey = "7"): RangeKey {
  return (RANGES.some((r) => r.key === value) ? value : fallback) as RangeKey;
}

/**
 * Der gleich lange Zeitraum davor - "letzte 7 Tage" gegen die 7 Tage davor.
 * Damit laesst sich zeigen, ob man Plaetze gutgemacht hat.
 */
export function previousRange(key: RangeKey): { since: string; until: string } | null {
  const since = rangeToSince(key);
  if (!since) return null;
  const days = Number(key);
  const start = new Date(new Date(`${since}T00:00:00Z`).getTime() - days * 86_400_000);
  return { since: start.toISOString().slice(0, 10), until: since };
}
