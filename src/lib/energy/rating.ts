/**
 * Wie teuer ist ein Grundversorger? Bewertet wird nicht gegen eine feste
 * Grenze, sondern gegen alle Orte der Preisquelle: die teuersten 20 % sind
 * "sehr teuer", die guenstigsten 20 % "sehr guenstig". So bleibt die Skala
 * richtig, auch wenn die Preise insgesamt steigen oder fallen.
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

export const PRICE_LEVELS: readonly PriceLevel[] = [
  { step: 0, label: "sehr günstig", pitch: "Kaum Wechselargument über den Preis" },
  { step: 1, label: "günstig", pitch: "Wenig Spielraum beim Preis" },
  { step: 2, label: "mittel", pitch: "Durchschnittlicher Grundversorger" },
  { step: 3, label: "teuer", pitch: "Gutes Wechselargument" },
  { step: 4, label: "sehr teuer", pitch: "Starkes Wechselargument" },
];

export interface PriceScale {
  /** Vier Grenzwerte, die die Werte in fuenf gleich grosse Gruppen teilen. */
  thresholds: number[];
  median: number;
  count: number;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function priceScale(values: number[]): PriceScale {
  if (values.length === 0) return { thresholds: [0, 0, 0, 0], median: 0, count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    thresholds: [0.2, 0.4, 0.6, 0.8].map(
      (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))],
    ),
    median: median(sorted),
    count: sorted.length,
  };
}

export function priceStep(value: number, scale: PriceScale): PriceStep {
  const index = scale.thresholds.findIndex((t) => value <= t);
  return (index === -1 ? 4 : index) as PriceStep;
}

export function priceLevel(value: number, scale: PriceScale): PriceLevel {
  return PRICE_LEVELS[priceStep(value, scale)];
}

export function priceColor(value: number | null, scale: PriceScale): string {
  if (value === null) return "#94a3b8";
  return PRICE_SCALE[priceStep(value, scale)];
}

/**
 * Stufe gegen einen festen Vergleichswert (Bundesdurchschnitt der
 * Grundversorgung). Fuer selbst gepflegte Preise: bei wenigen Orten waere
 * eine Rangfolge untereinander nichtssagend - einer waere immer "sehr teuer".
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
