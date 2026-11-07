import { parseDate, parseNumber } from "../energy/table";

/*
 * Die Provisionsliste des Portals als Tabelle lesen - aus der Excel-Datei
 * (xlsx.ts liefert die Zellen) oder aus Excel kopiert und eingefuegt.
 *
 * Erwartet die Spalten des Exports "Meine Provisionen": Anbieter, Tarif,
 * Verbrauch VON, Verbrauch BIS, Grundprovision, Aktionsprovision,
 * Folgeprovision, Abschluss, Anschluss. Die Reihenfolge ist egal, fehlende
 * Zusatzspalten zaehlen als 0. Ohne Server-Abhaengigkeiten - die Vorschau im
 * Browser und der Import pruefen mit denselben Regeln.
 */

/** Eine Zeile der Liste: eine Staffel eines Tarifs. */
export interface ImportRow {
  /** Zeile in der Datei - fuer Fehlermeldungen. */
  line: number;
  provider: string;
  name: string;
  kwhFrom: number;
  kwhTo: number;
  base: number;
  promo: number;
  follow: number;
  /** Anteil bei Abschluss bzw. Lieferbeginn, 0 bis 1. */
  payoutConclusion: number;
  payoutConnection: number;
}

export interface ReadResult {
  rows: ImportRow[];
  skipped: Array<{ line: number; error: string }>;
  /** Die Tabelle passt gar nicht - etwa ohne Kopfzeile. */
  error?: string;
}

type Field = "provider" | "name" | "kwhFrom" | "kwhTo" | "base" | "promo" | "follow" | "payoutConclusion" | "payoutConnection";

const REQUIRED: Field[] = ["provider", "name", "base"];
/** Hoechstens so viele Zeilen je Liste - der Export hat einige hundert. */
export const MAX_IMPORT_ROWS = 5000;
/** Groesster sinnvoller Jahresverbrauch - das Portal schreibt 1.500.000 fuer "unbegrenzt". */
const MAX_KWH = 100_000_000;

function simplify(header: string): string {
  return header.toLocaleLowerCase("de-DE").replace(/[^a-zäöüß]/g, "");
}

/** Spalte zu einer Ueberschrift - tolerant gegen Gross-/Kleinschreibung und Zusaetze. */
export function commissionColumn(header: string): Field | null {
  const h = simplify(header);
  if (!h) return null;
  if (h.startsWith("anbieter") || h.startsWith("versorger") || h === "lieferant") return "provider";
  if (h === "tarif" || h === "tarifname" || h === "produkt") return "name";
  if (h.includes("verbrauch") && h.includes("von")) return "kwhFrom";
  if (h.includes("verbrauch") && h.includes("bis")) return "kwhTo";
  if (h === "von" || h === "abkwh") return "kwhFrom";
  if (h === "bis" || h === "biskwh") return "kwhTo";
  if (h.startsWith("grundprovision") || h === "provision") return "base";
  if (h.startsWith("aktionsprovision") || h === "aktion") return "promo";
  if (h.startsWith("folgeprovision") || h === "folge") return "follow";
  if (h === "abschluss") return "payoutConclusion";
  if (h === "anschluss") return "payoutConnection";
  return null;
}

/** 1, "100%", "100 %", "1,0" -> 1; 0,5 oder 50 -> 0,5. */
function share(value: string | undefined): number | null {
  const n = parseNumber(value ?? "");
  if (n === null) return null;
  if (Number.isNaN(n) || n < 0) return NaN;
  const fraction = n > 1 ? n / 100 : n;
  return fraction > 1 ? NaN : fraction;
}

function amount(value: string | undefined, field: string, required: boolean): number {
  const n = parseNumber(value ?? "");
  if (n === null) {
    if (required) throw new Error(`${field} fehlt.`);
    return 0;
  }
  if (Number.isNaN(n)) throw new Error(`${field} ist keine Zahl.`);
  if (n < 0) throw new Error(`${field} darf nicht negativ sein.`);
  if (n > 100_000) throw new Error(`${field} ist unplausibel hoch.`);
  return Math.round(n * 1000) / 1000;
}

function kwh(value: string | undefined, fallback: number, field: string): number {
  const text = (value ?? "").replace(/\s|kwh/gi, "");
  // Ganze kWh mit Tausenderpunkten ("1.500.000") - parseNumber laese daraus ein Komma.
  const n = /^\d{1,3}([.,]\d{3})+$/.test(text) ? Number(text.replace(/[.,]/g, "")) : parseNumber(text);
  if (n === null) return fallback;
  if (Number.isNaN(n) || n < 0 || n > MAX_KWH) throw new Error(`${field} ist kein gültiger Verbrauch.`);
  return Math.round(n);
}

/**
 * Die Zellen einer Liste lesen. Die Kopfzeile darf weiter unten stehen
 * (manche Exporte haben Titelzeilen); sie wird an "Anbieter" und "Tarif" erkannt.
 */
export function readCommissionTable(cells: string[][]): ReadResult {
  const headerIndex = cells.slice(0, 20).findIndex((row) => {
    const fields = row.map(commissionColumn);
    return REQUIRED.every((field) => fields.includes(field));
  });
  if (headerIndex === -1) {
    return {
      rows: [],
      skipped: [],
      error: "Keine Kopfzeile gefunden. Erwartet werden mindestens die Spalten Anbieter, Tarif und Grundprovision.",
    };
  }
  const columns = new Map<Field, number>();
  cells[headerIndex].forEach((header, index) => {
    const field = commissionColumn(header);
    if (field && !columns.has(field)) columns.set(field, index);
  });
  const cell = (row: string[], field: Field) => {
    const index = columns.get(field);
    return index === undefined ? undefined : row[index]?.trim();
  };

  const rows: ImportRow[] = [];
  const skipped: ReadResult["skipped"] = [];
  const seen = new Map<string, number>();
  const body = cells.slice(headerIndex + 1);
  if (body.length > MAX_IMPORT_ROWS) {
    return { rows: [], skipped: [], error: `Bitte höchstens ${MAX_IMPORT_ROWS.toLocaleString("de-DE")} Zeilen auf einmal übernehmen.` };
  }
  body.forEach((row, offset) => {
    const line = headerIndex + offset + 2;
    if (row.every((value) => !value?.trim())) return;
    try {
      const provider = (cell(row, "provider") ?? "").replace(/\s+/g, " ").slice(0, 120);
      const name = (cell(row, "name") ?? "").replace(/\s+/g, " ").slice(0, 160);
      if (!provider) throw new Error("Anbieter fehlt.");
      if (!name) throw new Error("Tarif fehlt.");
      const kwhFrom = kwh(cell(row, "kwhFrom"), 0, "Verbrauch von");
      const kwhTo = kwh(cell(row, "kwhTo"), MAX_KWH, "Verbrauch bis");
      if (kwhFrom > kwhTo) throw new Error("Verbrauch von ist größer als Verbrauch bis.");
      const conclusion = share(cell(row, "payoutConclusion"));
      const connection = share(cell(row, "payoutConnection"));
      if (Number.isNaN(conclusion) || Number.isNaN(connection)) throw new Error("Abschluss/Anschluss sind keine gültigen Anteile.");
      const parsed: ImportRow = {
        line,
        provider,
        name,
        kwhFrom,
        kwhTo,
        base: amount(cell(row, "base"), "Grundprovision", true),
        promo: amount(cell(row, "promo"), "Aktionsprovision", false),
        follow: amount(cell(row, "follow"), "Folgeprovision", false),
        // Ohne Angabe: alles bei Abschluss - so steht es fast ueberall in der Liste.
        payoutConclusion: conclusion ?? (connection ? 1 - connection : 1),
        payoutConnection: connection ?? 0,
      };
      const key = rowKey(parsed);
      const previous = seen.get(key);
      if (previous !== undefined) {
        // Doppelt in der Liste: die spaetere Zeile gilt, wie beim Ueberschreiben in Excel.
        skipped.push({ line: rows[previous].line, error: `Doppelt (Zeile ${line} gilt).` });
        rows[previous] = parsed;
        return;
      }
      seen.set(key, rows.length);
      rows.push(parsed);
    } catch (error) {
      skipped.push({ line, error: error instanceof Error ? error.message : "Unlesbar." });
    }
  });
  return { rows, skipped };
}

/** Tarif eindeutig: Anbieter und Name, wie das Portal sie schreibt (ohne Gross-/Kleinschreibung). */
export function tariffKey(provider: string, name: string): string {
  return `${provider.trim().toLocaleLowerCase("de-DE")}\u0000${name.trim().toLocaleLowerCase("de-DE")}`;
}

function rowKey(row: Pick<ImportRow, "provider" | "name" | "kwhFrom" | "kwhTo">): string {
  return `${tariffKey(row.provider, row.name)}\u0000${row.kwhFrom}\u0000${row.kwhTo}`;
}

/** Nur ein Platzhalter (0,001 €) statt einer Provision: individuell vereinbart. */
export function isIndividual(row: Pick<ImportRow, "base" | "promo" | "follow">): boolean {
  return row.base < 0.01 && row.promo === 0 && row.follow === 0;
}

/**
 * Stand und Ende der Aktion aus dem Dateinamen - der Export heisst
 * "Meine Provisionen - 05.11.2026 bis 08.11.2026". Fehlt etwas, bleibt es leer.
 */
export function datesFromLabel(label: string): { validFrom: string; promoUntil: string } {
  const dates = [...label.matchAll(/(\d{1,2})[._-](\d{1,2})[._-](\d{4})/g)]
    .map((match) => parseDate(`${match[1]}.${match[2]}.${match[3]}`))
    .filter((value): value is string => Boolean(value));
  return { validFrom: dates[0] ?? "", promoUntil: dates[1] ?? "" };
}

/** Dateiname ohne Endung und mit Leerzeichen statt Unterstrichen - so steht der Stand in der App. */
export function labelFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
