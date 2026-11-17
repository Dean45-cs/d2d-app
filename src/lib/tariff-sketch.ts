/**
 * Skizze zum Tarifvergleich - die Rechnung so, wie man sie beim Paper Selling
 * vor dem Kunden auf Papier schreibt: je Jahr eine Zeile, der Bonus als
 * eigene Minuszeile im 1. Jahr, unten die Summe und eingekreist die
 * Ersparnis. Jede Zahl laesst sich mit dem Taschenrechner nachrechnen.
 *
 * Hier steht nur, WAS auf dem Papier steht (Texte und Betraege); wie es
 * aussieht, zeichnet components/tariff/PaperSketch.tsx.
 */
import { COMPARE_SPARTE_LABEL, eur, kwhLabel, roundCents, type CompareSparte, type Comparison, type RankedOffer } from "./tariff-compare";

/** Ein Feld der Tabelle: Jahreskosten, im 1. Jahr ggf. abzueglich Bonus. */
export interface SketchAmount {
  /** "837,40 €" */
  gross: string;
  /** "− 80,00 €" - nur, wenn es einen Bonus gibt */
  bonus: string | null;
  /** "757,40 €" - nur mit Bonus: was im 1. Jahr bleibt */
  net: string | null;
}

export interface SketchYear {
  /** "1. Jahr" */
  label: string;
  current: SketchAmount;
  offer: SketchAmount;
  /** Ersparnis in diesem Jahr (+ = neu guenstiger) */
  difference: number;
  /** "94,60 €" bzw. "− 13,31 €" */
  differenceText: string;
}

export interface Sketch {
  /** "Ihr Strom über 2 Jahre" */
  title: string;
  /** "bei 2.000 kWh im Jahr" */
  subtitle: string;
  currentName: string;
  offerName: string;
  years: SketchYear[];
  currentTotal: string;
  offerTotal: string;
  /** Ersparnis ueber den Zeitraum (+ = neu guenstiger) */
  saving: number;
  /** "109,20 €" - mit `savingLabel` gelesen, darum ohne Vorzeichen */
  savingText: string;
  /** "Sie sparen" bzw. "Neu teurer um" */
  savingLabel: string;
  /** "69,78 € statt 71,00 €" */
  monthly: string;
  /** Annahme, klein am Rand */
  note: string;
}

/** "− 13,31 €" mit echtem Minus und Abstand - auf Papier eindeutig. */
export function signedEur(value: number): string {
  const rounded = roundCents(value);
  return rounded < 0 ? `− ${eur(-rounded)}` : eur(rounded);
}

function amount(annual: number, bonus: number, firstYear: boolean): SketchAmount {
  if (!firstYear || bonus <= 0) return { gross: eur(annual), bonus: null, net: null };
  return { gross: eur(annual), bonus: `− ${eur(bonus)}`, net: eur(roundCents(annual - bonus)) };
}

export function buildSketch<T>(
  comparison: Comparison<T>,
  offer: RankedOffer<T>,
  names: { current: string; offer: string },
  sparte: CompareSparte,
  currentBonus = 0,
): Sketch {
  const { years, current } = comparison;
  const rows: SketchYear[] = Array.from({ length: years }, (_, index) => {
    const first = index === 0;
    const difference = first ? roundCents(current.firstYear - offer.cost.firstYear) : roundCents(current.followYear - offer.cost.followYear);
    return {
      label: `${index + 1}. Jahr`,
      current: amount(current.annual, currentBonus, first),
      offer: amount(offer.cost.annual, offer.price.bonus, first),
      difference,
      differenceText: signedEur(difference),
    };
  });
  const what = COMPARE_SPARTE_LABEL[sparte];
  return {
    title: years === 1 ? `Ihr ${what} im ersten Jahr` : `Ihr ${what} über ${years} Jahre`,
    subtitle: `bei ${kwhLabel(comparison.kwh)} im Jahr`,
    currentName: names.current,
    offerName: names.offer,
    years: rows,
    currentTotal: eur(current.total),
    offerTotal: eur(offer.cost.total),
    saving: offer.saving,
    savingText: eur(Math.abs(offer.saving)),
    savingLabel: offer.saving >= 0 ? "Sie sparen" : "Neu teurer um",
    monthly: `${eur(offer.cost.monthly)} statt ${eur(current.monthly)}`,
    note: "Gleichbleibende Preise angenommen · Bonus einmalig im 1. Jahr",
  };
}
