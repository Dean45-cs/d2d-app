/**
 * Tarifvergleich an der Tuer: was kostet ein Tarif ueber die Vertragslaufzeit
 * wirklich?
 *
 * Vergleichsportale und die Tarifliste zeigen meist die Ersparnis im ersten
 * Jahr samt Bonus. Der Bonus wird aber nur einmal gezahlt - ueber zwei Jahre
 * sieht die Reihenfolge oft anders aus. Darum rechnet die App immer ueber den
 * ganzen Zeitraum:
 *
 *   Jahreskosten   = Grundpreis €/Jahr + Verbrauch kWh × Arbeitspreis ct/kWh / 100
 *   Gesamtkosten   = N × Jahreskosten − Bonus        (Bonus einmal, im 1. Jahr)
 *   Ersparnis      = Gesamtkosten aktuell − Gesamtkosten neu
 *   Abschlag       = Jahreskosten / 12               (ohne Bonus)
 *   Break-even kWh = (N × (Grundpreis alt − neu) + Bonus neu − Bonus alt)
 *                    / (N × (Arbeitspreis neu − alt) / 100)
 *
 * Gerechnet wird mit gleichbleibenden Preisen. Ohne Abhaengigkeiten: laeuft im
 * Browser an der Tuer (auch ohne Netz) genauso wie in den Tests.
 */

import type { ProviderInfo } from "./energy/provider";

export type CompareSparte = "STROM" | "GAS";

export const COMPARE_SPARTEN: readonly CompareSparte[] = ["STROM", "GAS"];
export const COMPARE_SPARTE_LABEL: Record<CompareSparte, string> = { STROM: "Strom", GAS: "Gas" };

/** Typischer Verbrauch, solange keiner eingetragen ist - nur als Platzhalter. */
export const TYPICAL_KWH: Record<CompareSparte, number> = { STROM: 2500, GAS: 15000 };

/** Vergleichszeitraum: Standard 2 Jahre, an Laufzeit oder Preisgarantie anpassbar. */
export const DEFAULT_YEARS = 2;
export const MIN_YEARS = 1;
export const MAX_YEARS = 5;

/** Preise eines Vertrags, brutto. */
export interface TariffPrice {
  /** Grundpreis in Euro pro Jahr */
  baseYear: number;
  /** Arbeitspreis in ct/kWh */
  ct: number;
  /** Einmaliger Bonus in Euro (Neukunden-, Sofortbonus …), 0 ohne */
  bonus: number;
}

export interface TariffCost {
  /** Jahreskosten ohne Bonus */
  annual: number;
  /** 1. Jahr: Jahreskosten abzueglich Bonus */
  firstYear: number;
  /** Jedes weitere Jahr - der Bonus kommt nicht wieder */
  followYear: number;
  /** Ueber den ganzen Zeitraum */
  total: number;
  /** Monatlicher Abschlag: Jahreskosten / 12, ohne Bonus */
  monthly: number;
}

/**
 * Ab bzw. bis zu welchem Jahresverbrauch der neue Tarif ueber den Zeitraum
 * guenstiger ist als der aktuelle Vertrag.
 *
 * - `upTo`:  Arbeitspreis neu hoeher - guenstiger BIS `kwh`
 * - `from`:  Arbeitspreis neu niedriger - guenstiger AB `kwh`
 * - `always` / `never`: bei jedem Verbrauch guenstiger bzw. nie
 */
export type BreakEven =
  | { kind: "upTo"; kwh: number }
  | { kind: "from"; kwh: number }
  | { kind: "always" }
  | { kind: "never" };

/** Auf den Cent - Gleitkomma (2000 × 36,57 / 100 = 731,4000000001) bleibt nicht stehen. */
export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Jahreskosten ohne Bonus. */
export function annualCost(price: Pick<TariffPrice, "baseYear" | "ct">, kwh: number): number {
  return roundCents(price.baseYear + (kwh * price.ct) / 100);
}

/** Alle Kosten eines Vertrags fuer Verbrauch und Zeitraum. */
export function tariffCost(price: TariffPrice, kwh: number, years: number): TariffCost {
  const annual = annualCost(price, kwh);
  return {
    annual,
    firstYear: roundCents(annual - price.bonus),
    followYear: annual,
    total: roundCents(years * annual - price.bonus),
    monthly: roundCents(annual / 12),
  };
}

/** Grenzverbrauch, an dem neuer Tarif und aktueller Vertrag ueber den Zeitraum gleich viel kosten. */
export function breakEven(current: TariffPrice, offer: TariffPrice, years: number): BreakEven {
  const numerator = years * (current.baseYear - offer.baseYear) + offer.bonus - current.bonus;
  const denominator = (years * (offer.ct - current.ct)) / 100;
  // Gleicher Arbeitspreis: der Abstand haengt nicht vom Verbrauch ab.
  if (Math.abs(denominator) < 1e-9) return numerator > 1e-9 ? { kind: "always" } : { kind: "never" };
  const kwh = numerator / denominator;
  if (denominator > 0) return kwh > 0 ? { kind: "upTo", kwh } : { kind: "never" };
  return kwh > 0 ? { kind: "from", kwh } : { kind: "always" };
}

export interface Offer<T = unknown> {
  price: TariffPrice;
  /** Was die Oberflaeche zum Tarif mitgibt (Name, Anbieter …) - wird durchgereicht. */
  meta: T;
}

export interface RankedOffer<T = unknown> extends Offer<T> {
  cost: TariffCost;
  /** Ersparnis ueber den Zeitraum ggue. dem aktuellen Vertrag (+ = guenstiger) */
  saving: number;
  /** Ersparnis im 1. Jahr - so rechnen Portale */
  savingFirstYear: number;
  /** Ersparnis in jedem Folgejahr (negativ: ab dem 2. Jahr teurer) */
  savingFollowYear: number;
  breakEven: BreakEven;
  /** Platz nach Gesamtkosten, ab 1 */
  rank: number;
}

export interface Comparison<T = unknown> {
  kwh: number;
  years: number;
  current: TariffCost;
  /** Nach Gesamtkosten sortiert, der guenstigste zuerst */
  offers: Array<RankedOffer<T>>;
  /** Der guenstigste neue Tarif - null ohne Tarife */
  best: RankedOffer<T> | null;
}

/**
 * Vergleicht beliebig viele neue Tarife mit dem aktuellen Vertrag. Sortiert
 * wird nach Gesamtkosten ueber den Zeitraum; bei Gleichstand bleibt die
 * Reihenfolge der Eingabe.
 */
export function compareTariffs<T>(
  kwh: number,
  years: number,
  current: TariffPrice,
  offers: Array<Offer<T>>,
): Comparison<T> {
  const currentCost = tariffCost(current, kwh, years);
  const ranked = offers
    .map((offer, index) => {
      const cost = tariffCost(offer.price, kwh, years);
      return {
        ...offer,
        cost,
        saving: roundCents(currentCost.total - cost.total),
        savingFirstYear: roundCents(currentCost.firstYear - cost.firstYear),
        savingFollowYear: roundCents(currentCost.followYear - cost.followYear),
        breakEven: breakEven(current, offer.price, years),
        index,
      };
    })
    .sort((a, b) => a.cost.total - b.cost.total || a.index - b.index)
    .map((offer, position): RankedOffer<T> => ({
      price: offer.price,
      meta: offer.meta,
      cost: offer.cost,
      saving: offer.saving,
      savingFirstYear: offer.savingFirstYear,
      savingFollowYear: offer.savingFollowYear,
      breakEven: offer.breakEven,
      rank: position + 1,
    }));
  return { kwh, years, current: currentCost, offers: ranked, best: ranked[0] ?? null };
}

/* ------------------------------------------------------------------------ */
/*                                 Eingabe                                   */
/* ------------------------------------------------------------------------ */

export type BaseUnit = "month" | "year";

/** "36,57", "1.234,5", "120.60" - Komma oder Punkt, wie getippt. null = leer, NaN = unlesbar. */
export function readNumber(text: string): number | null {
  const raw = text.trim();
  if (!raw) return null;
  let value = raw.replace(/[^\d,.-]/g, "");
  if (!value) return NaN;
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  if (comma !== -1 && dot !== -1) {
    // Das hintere Zeichen trennt die Nachkommastellen, das andere die Tausender.
    value = comma > dot ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  } else if (comma !== -1) {
    value = value.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
    // "2.000" ist an der Tuer ein Verbrauch, kein Komma.
    value = value.replace(/\./g, "");
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/** Jahresverbrauch aus dem Feld - ganze kWh, "2.000" wie "2000". */
export function readKwh(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return n > 0 && n <= 1_000_000 ? n : null;
}

/** Was eine Tarifzeile als Text haelt - so wie getippt, damit nichts umspringt. */
export interface PriceText {
  /** Grundpreis in der gewaehlten Einheit (Monat oder Jahr) */
  base: string;
  ct: string;
  bonus: string;
}

export type PriceField = keyof PriceText;

export type PriceCheck =
  | { ok: true; price: TariffPrice }
  /** Unvollstaendig: noch nichts falsch, nur nicht fertig */
  | { ok: false; field: PriceField | null; error: string | null };

/**
 * Liest eine Tarifzeile. Grenzen fangen die typischen Vertipper ab:
 * "385" statt "38,5" ct, der Monats-Grundpreis im Jahresfeld.
 */
export function readPrice(text: PriceText, unit: BaseUnit, sparte: CompareSparte): PriceCheck {
  const ct = readNumber(text.ct);
  const base = readNumber(text.base);
  const bonus = readNumber(text.bonus);
  const maxCt = sparte === "GAS" ? 60 : 150;
  if (ct !== null && (Number.isNaN(ct) || ct <= 0 || ct > maxCt)) {
    return { ok: false, field: "ct", error: `Arbeitspreis in ct/kWh – z. B. ${sparte === "GAS" ? "11,9" : "36,57"}` };
  }
  const maxBase = unit === "month" ? 100 : 1200;
  if (base !== null && (Number.isNaN(base) || base < 0 || base > maxBase)) {
    return { ok: false, field: "base", error: unit === "month" ? "Grundpreis pro Monat – z. B. 10,05" : "Grundpreis pro Jahr – z. B. 120,60" };
  }
  if (bonus !== null && (Number.isNaN(bonus) || bonus < 0 || bonus > 2000)) {
    return { ok: false, field: "bonus", error: "Bonus in Euro – z. B. 80" };
  }
  if (ct === null) return { ok: false, field: null, error: null };
  const baseYear = base === null ? 0 : unit === "month" ? base * 12 : base;
  return { ok: true, price: { baseYear: roundCents(baseYear), ct, bonus: bonus ?? 0 } };
}

/** Zahl wieder als Text fuers Feld: "120,6" → "120,60", ganze ohne Komma. */
export function numberText(value: number, decimals = 2): string {
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false });
}

/** Grundpreis beim Umschalten Monat/Jahr umrechnen - Eingetipptes bleibt gueltig. */
export function convertBase(text: string, from: BaseUnit, to: BaseUnit): string {
  if (from === to) return text;
  const n = readNumber(text);
  if (n === null || Number.isNaN(n)) return text;
  return numberText(roundCents(to === "year" ? n * 12 : n / 12));
}

/* ------------------------------------------------------------------------ */
/*                                 Ausgabe                                   */
/* ------------------------------------------------------------------------ */

/** "1.594,80 €" - immer mit Cent, an der Tuer wird nachgerechnet. */
export function eur(value: number): string {
  return value.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "3.030 kWh" */
export function kwhLabel(value: number): string {
  return `${Math.round(value).toLocaleString("de-DE")} kWh`;
}

/** "über 2 Jahre", "im ersten Jahr" */
export function periodPhrase(years: number): string {
  return years === 1 ? "im ersten Jahr" : `über ${years} Jahre`;
}

/** "Über 2 Jahre sparen Sie" - die Zeile fuer den Kunden. */
export function headline(years: number): string {
  const phrase = periodPhrase(years);
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} sparen Sie`;
}

/** "günstiger bis ca. 3.030 kWh" - der Break-even in Worten. */
export function breakEvenText(value: BreakEven): string {
  switch (value.kind) {
    case "upTo":
      return `günstiger bis ca. ${kwhLabel(value.kwh)}`;
    case "from":
      return `günstiger ab ca. ${kwhLabel(value.kwh)}`;
    case "always":
      return "bei jedem Verbrauch günstiger";
    case "never":
      return "bei keinem Verbrauch günstiger";
  }
}

/* ------------------------------------------------------------------------ */
/*                        Daten aus der App (vom Server)                     */
/* ------------------------------------------------------------------------ */

/**
 * Tarif aus der Provisionsliste - nur, was der Vergleich braucht: Anbieter,
 * Name, Sparte und fuer welche Verbraeuche er gilt. Keine Betraege: der
 * Bildschirm wird dem Kunden gezeigt.
 */
export interface CompareTariffOption {
  id: number;
  provider: string;
  name: string;
  sparte: CompareSparte;
  business: boolean;
  /** Verbrauchsstaffeln [von, bis] in kWh - leer: keine Angabe */
  ranges: Array<[number, number]>;
}

/** Gilt der Tarif fuer diesen Verbrauch? Ohne Staffeln oder Verbrauch: ja. */
export function coversKwh(option: Pick<CompareTariffOption, "ranges">, kwh: number | null): boolean {
  if (kwh === null || option.ranges.length === 0) return true;
  return option.ranges.some(([from, to]) => from <= kwh && kwh <= to);
}

/** Grundversorger eines Ortes - so steht er auf dem Preisblatt. */
export interface ComparePlace {
  plz: string;
  city: string;
  /** Gebiet, aus dem der Ort kommt (fuer die Auswahl) */
  label: string;
  provider: Record<CompareSparte, string>;
  price: Record<CompareSparte, { ct: number; baseYear: number | null } | null>;
}

/**
 * Grundversorger als Ort fuer den Vergleich - null ohne Preis. Nur, was
 * wirklich fuer diesen Ort gilt: ein Nachbarort kann einen anderen Versorger
 * haben, dann waere der aktuelle Vertrag falsch vorbelegt.
 */
export function comparePlace(info: ProviderInfo | null, label: string): ComparePlace | null {
  if (!info || info.match === "nearby" || info.match === "region" || (!info.strom && !info.gas)) return null;
  return {
    plz: info.plz,
    city: info.city,
    label,
    provider: { STROM: info.provider, GAS: info.gasProvider || info.provider },
    price: {
      STROM: info.strom ? { ct: info.strom.ct, baseYear: info.strom.base } : null,
      GAS: info.gas ? { ct: info.gas.ct, baseYear: info.gas.base } : null,
    },
  };
}
