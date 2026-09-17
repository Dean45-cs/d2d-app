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
