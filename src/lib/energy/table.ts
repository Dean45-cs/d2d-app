/**
 * Grundversorger-Preise pruefen und als Tabelle lesen oder schreiben.
 *
 * Eine Schnittstelle mit echten Grundversorgungstarifen gibt es nicht - die
 * Werte stehen auf dem Preisblatt des Versorgers und werden abgetippt: einzeln
 * im Formular oder viele auf einmal als Tabelle (aus Excel oder Google Tabellen
 * kopiert, oder als CSV-Datei).
 *
 * Ohne Server-Abhaengigkeiten: Formular und Import-Vorschau im Browser pruefen
 * mit denselben Regeln wie die API. Was die Vorschau als gut zeigt, wird auch
 * gespeichert.
 */

/** Eingaben wie im Formular - Grundpreis in Euro pro Monat. */
export interface PriceFields {
  postalCode: string;
  city: string;
  provider: string;
  gasProvider: string;
  stromCt: string | number | null;
  stromBaseMonth: string | number | null;
  gasCt: string | number | null;
  gasBaseMonth: string | number | null;
  validFrom: string;
  sourceUrl: string;
  lat?: number | null;
  lng?: number | null;
}

/** Geprueft und so, wie es gespeichert wird - Grundpreis pro Jahr. */
export interface CheckedPrice {
  postal_code: string;
  city: string;
  provider: string;
  gas_provider: string;
  strom_ct_kwh: number | null;
  strom_base_eur: number | null;
  gas_ct_kwh: number | null;
  gas_base_eur: number | null;
  valid_from: string;
  source_url: string;
}

export type CheckResult =
  | { ok: true; value: CheckedPrice }
  /** `empty`: weder Strom- noch Gaspreis - in einer Tabelle einfach eine noch offene Zeile. */
  | { ok: false; error: string; empty?: boolean };

/* --------------------------------- Werte --------------------------------- */

/**
 * "38,52", "38.52", "38,52 ct" oder "1.234,56 €" -> Zahl.
 * Leer ergibt null, Unlesbares NaN.
 */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const raw = String(value).trim();
  if (!raw) return null;
  let text = raw.replace(/[^\d,.-]/g, "");
  if (!text) return NaN;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma !== -1 && dot !== -1) {
    // Das hintere Zeichen trennt die Nachkommastellen, das andere die Tausender.
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (comma !== -1) {
    text = text.replace(",", ".");
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  const y = year < 100 ? year + 2000 : year;
  const date = new Date(Date.UTC(y, month - 1, day));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const ISO_DATE = /(\d{4})-(\d{1,2})-(\d{1,2})/g;
const GERMAN_DATE = /(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})/g;

/**
 * "2026-01-01", "1.1.2026" oder "01.01.26" -> "2026-01-01". Leer bleibt leer,
 * Unlesbares null.
 *
 * Steht Strom und Gas mit je eigenem Stichtag im selben Feld ("Strom
 * 01.02.2026 / Gas 01.07.2026" - Grundversorger aendern die Preise fuer
 * beide oft getrennt), gilt der fruehere der beiden Tage: die App hat nur
 * ein Feld je Ort, nicht je Energieart.
 */
export function parseDate(value: string): string | null {
  const text = value.trim();
  if (!text) return "";

  // Das ganze Feld ist ein Datum - der Regelfall.
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const german = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/);
  if (german) return toIsoDate(Number(german[3]), Number(german[2]), Number(german[1]));

  // Freitext mit mehreren Daten - das fruehste gilt.
  const found: string[] = [];
  for (const m of text.matchAll(GERMAN_DATE)) {
    const parsed = toIsoDate(Number(m[3]), Number(m[2]), Number(m[1]));
    if (parsed) found.push(parsed);
  }
  for (const m of text.matchAll(ISO_DATE)) {
    const parsed = toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (parsed) found.push(parsed);
  }
  return found.length > 0 ? found.sort()[0] : null;
}

/** Excel schneidet fuehrende Nullen ab: aus 01067 wird 1067. */
export function normalizePostalCode(value: string): string {
  const digits = value.trim().replace(/\s/g, "");
  return /^\d{4}$/.test(digits) ? `0${digits}` : digits;
}

/* -------------------------------- Pruefen -------------------------------- */

function text(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Prueft einen Preis wie vom Preisblatt: Arbeitspreis in ct/kWh, Grundpreis
 * in Euro pro Monat, beides brutto.
 */
export function checkPrice(input: PriceFields): CheckResult {
  const postal = normalizePostalCode(String(input.postalCode ?? ""));
  if (!/^\d{5}$/.test(postal)) return { ok: false, error: "Bitte eine fünfstellige PLZ angeben." };

  const stromCt = parseNumber(input.stromCt);
  const gasCt = parseNumber(input.gasCt);
  const stromBase = parseNumber(input.stromBaseMonth);
  const gasBase = parseNumber(input.gasBaseMonth);

  for (const [value, label] of [
    [stromCt, "Strom"],
    [gasCt, "Gas"],
  ] as const) {
    if (value === null) continue;
    if (Number.isNaN(value) || value < 3 || value > 150) {
      return {
        ok: false,
        error: `${label}: Arbeitspreis bitte in Cent pro kWh angeben (z. B. 38,5).`,
      };
    }
  }
  for (const [value, label] of [
    [stromBase, "Strom"],
    [gasBase, "Gas"],
  ] as const) {
    if (value === null) continue;
    if (Number.isNaN(value) || value < 0 || value > 200) {
      return {
        ok: false,
        error: `${label}: Grundpreis bitte in Euro pro Monat angeben (z. B. 13,50).`,
      };
    }
  }
  if (stromCt === null && gasCt === null) {
    return {
      ok: false,
      error: "Bitte mindestens den Strom- oder den Gaspreis eintragen.",
      empty: true,
    };
  }

  const provider = text(input.provider, 120);
  if (!provider) return { ok: false, error: "Bitte den Grundversorger angeben." };

  const validFrom = parseDate(String(input.validFrom ?? ""));
  if (validFrom === null) {
    return { ok: false, error: "„Gültig ab“ bitte als Datum angeben (TT.MM.JJJJ)." };
  }

  let sourceUrl = text(input.sourceUrl, 500);
  if (/^www\./i.test(sourceUrl)) sourceUrl = `https://${sourceUrl}`;
  if (sourceUrl && !/^https?:\/\/\S+$/i.test(sourceUrl)) {
    return { ok: false, error: "Der Link zum Preisblatt muss mit https:// beginnen." };
  }

  return {
    ok: true,
    value: {
      postal_code: postal,
      city: text(input.city, 120),
      provider,
      gas_provider: text(input.gasProvider, 120),
      strom_ct_kwh: stromCt === null ? null : Math.round(stromCt * 1000) / 1000,
      strom_base_eur: stromBase === null ? null : Math.round(stromBase * 12 * 100) / 100,
      gas_ct_kwh: gasCt === null ? null : Math.round(gasCt * 1000) / 1000,
      gas_base_eur: gasBase === null ? null : Math.round(gasBase * 12 * 100) / 100,
      valid_from: validFrom,
      source_url: sourceUrl,
    },
  };
}

/* -------------------------------- Tabelle -------------------------------- */

type FieldKey = keyof PriceFields;

/** Spalten der Vorlage - in dieser Reihenfolge gilt auch eine Tabelle ohne Kopfzeile. */
export const TABLE_COLUMNS: ReadonlyArray<{ key: FieldKey; label: string }> = [
  { key: "postalCode", label: "PLZ" },
  { key: "city", label: "Ort" },
  { key: "provider", label: "Grundversorger Strom" },
  { key: "stromCt", label: "Strom Arbeitspreis ct/kWh" },
  { key: "stromBaseMonth", label: "Strom Grundpreis €/Monat" },
  { key: "gasProvider", label: "Grundversorger Gas" },
  { key: "gasCt", label: "Gas Arbeitspreis ct/kWh" },
  { key: "gasBaseMonth", label: "Gas Grundpreis €/Monat" },
  { key: "validFrom", label: "Gültig ab" },
  { key: "sourceUrl", label: "Link zum Preisblatt" },
];

function simplify(header: string): string {
  return header
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Ordnet eine Spaltenueberschrift einem Feld zu - grosszuegig, damit auch
 * selbst gebaute Tabellen passen ("Arbeitspreis Strom", "strom_ct_kwh", ...).
 * `yearly`: der Grundpreis steht pro Jahr in der Spalte.
 */
export function columnFor(header: string): { key: FieldKey; yearly?: boolean } | null {
  const n = simplify(header);
  if (!n) return null;
  if (/^(plz|postleitzahl|postalcode|zip)$/.test(n)) return { key: "postalCode" };
  if (/^(ort|stadt|city|gemeinde)$/.test(n)) return { key: "city" };
  if (/^(lat|latitude|breite)$/.test(n)) return { key: "lat" };
  if (/^(lng|lon|longitude|laenge)$/.test(n)) return { key: "lng" };
  if (/^(gueltigab|gueltig|gueltigkeit|validfrom|stand)/.test(n)) return { key: "validFrom" };
  if (/(link|url|preisblatt|quelle)/.test(n)) return { key: "sourceUrl" };

  const gas = n.includes("gas");
  if (/(versorger|provider|anbieter)/.test(n)) return { key: gas ? "gasProvider" : "provider" };
  if (/(grundpreis|base)/.test(n)) {
    const yearly = /(jahr|year|jaehrl)/.test(n) || (/eur$/.test(n) && !n.includes("monat"));
    return { key: gas ? "gasBaseMonth" : "stromBaseMonth", yearly };
  }
  if (/(arbeitspreis|ct|kwh|power)/.test(n) || n === "strom" || n === "gas") {
    return { key: gas ? "gasCt" : "stromCt" };
  }
  return null;
}

/**
 * Zerlegt eingefuegten Text in Zeilen und Zellen. Trennzeichen: Tabulator
 * (aus Excel/Google Tabellen kopiert), Semikolon (deutsche CSV) oder Komma.
 */
export function splitTable(input: string): string[][] {
  const clean = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  const first = clean.split("\n")[0];
  const count = (char: string) => first.split(char).length - 1;
  const delimiter =
    count("\t") > 0 ? "\t" : count(";") >= count(",") ? ";" : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (char === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field.trim());
  rows.push(row);
  return rows.filter((r) => r.some((cell) => cell !== ""));
}

export interface TableRow {
  /** Zeile in der eingefuegten Tabelle (1 = erste Zeile) */
  line: number;
  fields: PriceFields;
}

/** Liest eine Preistabelle. Ohne Kopfzeile gilt die Spaltenfolge der Vorlage. */
export function readPriceTable(input: string): { rows: TableRow[]; error?: string } {
  const table = splitTable(input);
  if (table.length === 0) return { rows: [] };

  const header = table[0].map((cell) => columnFor(cell));
  const hasHeader = header.some((column) => column?.key === "postalCode");
  if (!hasHeader && !/^\d{4,5}$/.test(table[0][0]?.trim() ?? "")) {
    return {
      rows: [],
      error: "Keine Spalte „PLZ“ gefunden. Am einfachsten die Vorlage verwenden.",
    };
  }
  const columns = hasHeader ? header : TABLE_COLUMNS.map((column) => ({ key: column.key }));
  const body = hasHeader ? table.slice(1) : table;
  const offset = hasHeader ? 2 : 1;

  const rows = body.map((cells, index): TableRow => {
    const fields: PriceFields = {
      postalCode: "",
      city: "",
      provider: "",
      gasProvider: "",
      stromCt: null,
      stromBaseMonth: null,
      gasCt: null,
      gasBaseMonth: null,
      validFrom: "",
      sourceUrl: "",
    };
    columns.forEach((column, i) => {
      const cell = cells[i]?.trim() ?? "";
      if (!column || cell === "") return;
      const { key } = column;
      if (key === "lat" || key === "lng") {
        const n = parseNumber(cell);
        fields[key] = n !== null && Number.isFinite(n) ? n : null;
      } else if (key === "stromBaseMonth" || key === "gasBaseMonth") {
        const n = parseNumber(cell);
        // Jahresbetrag auf den Monat umrechnen - ungerundet, sonst kommt beim
        // Speichern (wieder mal 12) nicht derselbe Jahresbetrag heraus.
        fields[key] = "yearly" in column && column.yearly && n !== null && Number.isFinite(n)
          ? n / 12
          : cell;
      } else {
        fields[key] = cell;
      }
    });
    return { line: index + offset, fields };
  });
  return { rows };
}

/** Zahl fuer eine deutsche Tabelle: Komma, keine Tausenderpunkte. */
export function tableNumber(value: number | null, digits = 3): string {
  return value === null
    ? ""
    : value.toLocaleString("de-DE", { maximumFractionDigits: digits, useGrouping: false });
}

/** CSV mit Semikolon - so oeffnet Excel sie in Deutschland ohne Umweg. */
export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => (/[";\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(";"),
    )
    .join("\r\n");
}
