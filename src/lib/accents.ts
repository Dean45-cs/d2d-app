/*
 * Die Akzentfarben der App - nur Namen, ohne Farbrechnung, damit jede Seite
 * sie kennen darf. Wie eine Farbe aussieht, steht in theme-palette.ts.
 */

export const ACCENT_IDS = [
  "gruen",
  "petrol",
  "blau",
  "indigo",
  "violett",
  "pink",
  "rot",
  "orange",
  "gold",
  "graphit",
] as const;

export type AccentId = (typeof ACCENT_IDS)[number];

export const ACCENT_LABEL: Record<AccentId, string> = {
  gruen: "Grün",
  petrol: "Petrol",
  blau: "Blau",
  indigo: "Indigo",
  violett: "Violett",
  pink: "Pink",
  rot: "Rot",
  orange: "Orange",
  gold: "Gold",
  graphit: "Graphit",
};

/** Die Farbe, in der die App erschienen ist. */
export const DEFAULT_ACCENT: AccentId = "gruen";

export function isAccent(value: unknown): value is AccentId {
  return typeof value === "string" && (ACCENT_IDS as readonly string[]).includes(value);
}
