/**
 * Wie teuer ist ein Grundversorger? Gemessen wird am Bundesdurchschnitt der
 * Grundversorgung (Vergleichswert in den Einstellungen) - nicht an einer
 * Rangfolge der eingetragenen Orte: bei wenigen Orten waere einer davon
 * immer "sehr teuer", auch wenn alle guenstig sind.
 *
 * Ohne "server-only": Energiekarte (Browser) und Uebersicht (Server) rechnen
 * mit derselben Skala.
 */

export type Energy = "strom" | "gas";

/** 0 = sehr guenstig ... 4 = sehr teuer */
export type PriceStep = 0 | 1 | 2 | 3 | 4;

export interface PriceLevel {
  step: PriceStep;
  label: string;
  /** Kurzer Satz fuer den Vertrieb: lohnt sich das Klingeln? */
  pitch: string;
}

/**
 * Farbskala als CSS-Variablen (brand.css): sequenziell von grau (kaum
 * Wechselargument) bis tiefgruen (starkes Argument). Die Helligkeit steigt
 * stetig - lesbar auch ohne Farbsehen, in Hell und Dunkel eigens abgestimmt.
 */
export const PRICE_SCALE = [
  "var(--price-0)",
  "var(--price-1)",
  "var(--price-2)",
  "var(--price-3)",
  "var(--price-4)",
] as const;

/** Farbe eines Ortes, fuer den noch kein Preis vorliegt. */
export const NO_PRICE_COLOR = "var(--price-none)";

export const PRICE_LEVELS: readonly PriceLevel[] = [
  { step: 0, label: "sehr günstig", pitch: "Kaum Wechselargument über den Preis" },
  { step: 1, label: "günstig", pitch: "Wenig Spielraum beim Preis" },
  { step: 2, label: "mittel", pitch: "Durchschnittlicher Grundversorger" },
  { step: 3, label: "teuer", pitch: "Gutes Wechselargument" },
  { step: 4, label: "sehr teuer", pitch: "Starkes Wechselargument" },
];

/**
 * Stufe gegen den Vergleichswert: ab 3 % darueber "teuer", ab 8 % "sehr
 * teuer", entsprechend nach unten.
 */
export function referenceStep(value: number, reference: number): PriceStep {
  if (reference <= 0) return 2;
  const deviation = (value - reference) / reference;
  if (deviation <= -0.08) return 0;
  if (deviation <= -0.03) return 1;
  if (deviation < 0.03) return 2;
  if (deviation < 0.08) return 3;
  return 4;
}
