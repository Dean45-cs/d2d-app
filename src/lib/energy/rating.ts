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

/** Farbskala: gruen = guenstig, rot = teuer (= bestes Wechselargument). */
export const PRICE_SCALE = ["#16a34a", "#84cc16", "#eab308", "#f97316", "#dc2626"] as const;

/** Farbe eines Ortes, fuer den noch kein Preis vorliegt. */
export const NO_PRICE_COLOR = "#94a3b8";

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
