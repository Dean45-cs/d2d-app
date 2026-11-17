/**
 * Was sich das Geraet beim Tarifvergleich merkt - nichts davon geht an den
 * Server.
 *
 * 1. Preise je Tarif und PLZ: Tarifpreise haengen vom Netzgebiet ab und stehen
 *    nicht in der Provisionsliste. Wer in einem Gebiet unterwegs ist, tippt sie
 *    einmal ab - an der naechsten Tuer stehen sie als Vorschlag da.
 * 2. Der laufende Vergleich: zwischen zwei Tueren derselben Strasse bleiben
 *    Tarife und Zeitraum stehen, und der Wechsel in den Tarifrechner des
 *    Partners loescht nichts.
 *
 * Keine Kundendaten: gemerkt werden Preise, Verbrauch und Anbietername.
 * Der Speicher laesst sich fuer Tests uebergeben; ohne localStorage (privater
 * Modus) rechnet der Vergleich einfach ohne Gedaechtnis.
 */

import type { BaseUnit, CompareSparte, PriceText } from "./tariff-compare";

const PRICES_KEY = "d2d_tariff_prices_v1";
const DRAFT_KEY = "d2d_tariff_compare_v1";
/** So viele Tarifpreise behaelt das Geraet - die zuletzt benutzten. */
export const MAX_REMEMBERED = 60;
/** Nach einem halben Jahr ist ein Tarifpreis kein Vorschlag mehr. */
const PRICE_MAX_AGE_MS = 183 * 24 * 60 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read<T>(store: Store | null, key: string): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(store: Store | null, key: string, value: unknown): void {
  if (!store) return;
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, JSON.stringify(value));
  } catch {
    // Speicher voll oder gesperrt - der Vergleich laeuft trotzdem.
  }
}

/* ------------------------------ Tarifpreise ----------------------------- */

export interface RememberedPrice {
  sparte: CompareSparte;
  provider: string;
  name: string;
  /** PLZ, fuer die der Preis galt - "" ohne PLZ */
  plz: string;
  /** Grundpreis immer pro Jahr, ct/kWh, Bonus - als Zahlen */
  baseYear: number;
  ct: number;
  bonus: number;
  /** Zeitpunkt der letzten Nutzung (ms) */
  usedAt: number;
}

function sameTariff(a: Pick<RememberedPrice, "sparte" | "provider" | "name" | "plz">, b: typeof a): boolean {
  const norm = (text: string) => text.trim().toLocaleLowerCase("de-DE");
  return a.sparte === b.sparte && a.plz === b.plz && norm(a.provider) === norm(b.provider) && norm(a.name) === norm(b.name);
}

function loadPrices(store: Store | null, now: number): RememberedPrice[] {
  const list = read<RememberedPrice[]>(store, PRICES_KEY);
  if (!Array.isArray(list)) return [];
  return list.filter(
    (entry) =>
      entry &&
      (entry.sparte === "STROM" || entry.sparte === "GAS") &&
      typeof entry.ct === "number" &&
      typeof entry.usedAt === "number" &&
      now - entry.usedAt < PRICE_MAX_AGE_MS,
  );
}

/** Die zuletzt benutzten Tarife fuer Sparte und PLZ - die neuesten zuerst. */
export function recentPrices(sparte: CompareSparte, plz: string, store = browserStore(), now = Date.now()): RememberedPrice[] {
  return loadPrices(store, now)
    .filter((entry) => entry.sparte === sparte && entry.plz === plz)
    .sort((a, b) => b.usedAt - a.usedAt);
}

/** Der gemerkte Preis eines Tarifs fuer diese PLZ - undefined, wenn keiner da ist. */
export function findPrice(
  key: Pick<RememberedPrice, "sparte" | "provider" | "name" | "plz">,
  store = browserStore(),
  now = Date.now(),
): RememberedPrice | undefined {
  return loadPrices(store, now).find((entry) => sameTariff(entry, key));
}

/** Preise merken - ersetzt denselben Tarif in derselben PLZ, behaelt die neuesten. */
export function rememberPrices(
  entries: Array<Omit<RememberedPrice, "usedAt">>,
  store = browserStore(),
  now = Date.now(),
): void {
  if (entries.length === 0) return;
  let list = loadPrices(store, now);
  for (const entry of entries) {
    if (!entry.provider.trim() && !entry.name.trim()) continue;
    list = [{ ...entry, usedAt: now }, ...list.filter((other) => !sameTariff(other, entry))];
  }
  write(store, PRICES_KEY, list.sort((a, b) => b.usedAt - a.usedAt).slice(0, MAX_REMEMBERED));
}

/* ---------------------------- Laufender Vergleich ----------------------- */

/** Eine Zeile des Vergleichs, wie sie im Formular steht. */
export interface ContractDraft extends PriceText {
  /** Stabiler Schluessel fuer React - bleibt beim Umsortieren */
  key: string;
  provider: string;
  name: string;
  /** Tarif aus der Provisionsliste - null: frei eingetippt */
  tariffId: number | null;
  /** Grundpreis wie auf dem Blatt: pro Monat oder pro Jahr */
  unit: BaseUnit;
}

export interface SparteDraft {
  kwh: string;
  current: ContractDraft;
  offers: ContractDraft[];
}

export interface CompareDraft {
  sparte: CompareSparte;
  years: number;
  plz: string;
  strom: SparteDraft;
  gas: SparteDraft;
  savedAt: number;
}

/** Nach einem Arbeitstag beginnt der Vergleich frisch. */
const DRAFT_MAX_AGE_MS = 14 * 60 * 60 * 1000;

export function loadDraft(store = browserStore(), now = Date.now()): CompareDraft | null {
  const draft = read<CompareDraft>(store, DRAFT_KEY);
  if (!draft || typeof draft.savedAt !== "number" || now - draft.savedAt > DRAFT_MAX_AGE_MS) return null;
  if (!draft.strom?.current || !draft.gas?.current || !Array.isArray(draft.strom.offers) || !Array.isArray(draft.gas.offers)) {
    return null;
  }
  return draft;
}

export function saveDraft(draft: Omit<CompareDraft, "savedAt"> | null, store = browserStore(), now = Date.now()): void {
  write(store, DRAFT_KEY, draft === null ? null : { ...draft, savedAt: now });
}
