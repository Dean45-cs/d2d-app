import { mapRow, parseCsv, type PriceRow } from "./adapters";

/**
 * Prueft eine Preistabelle fuer die Tagesquelle, bevor sie veroeffentlicht wird.
 *
 * Die Tabelle wird woechentlich per KI-Recherche gepflegt (siehe
 * docs/ENERGIE-RECHERCHE.md). Was hier durchfaellt, darf nicht auf die Karte:
 * ein falscher Preis schickt das Team ins falsche Gebiet.
 *
 * Zusaetzlich zu den Spalten der Tagesquelle verlangt die Recherche je Zeile
 *   quelle_url   - das Preisblatt, aus dem der Preis stammt
 *   geprueft_am  - wann er zuletzt nachgeschaut wurde (JJJJ-MM-TT)
 */

/** Plausible Grenzen fuer die Grundversorgung, brutto. */
const LIMITS = {
  strom_ct_kwh: [20, 80],
  strom_base_eur: [0, 600],
  gas_ct_kwh: [6, 40],
  gas_base_eur: [0, 600],
} as const;

export interface FeedIssue {
  line: number;
  plz: string;
  error: string;
}

export interface FeedCheck {
  rows: PriceRow[];
  issues: FeedIssue[];
  /** PLZ, deren Pruefdatum aelter als `maxAgeDays` ist oder fehlt. */
  stale: string[];
}

export function checkFeedCsv(text: string, today = new Date(), maxAgeDays = 14): FeedCheck {
  const raw = parseCsv(text);
  const rows: PriceRow[] = [];
  const issues: FeedIssue[] = [];
  const stale: string[] = [];
  const seen = new Set<string>();

  raw.forEach((record, index) => {
    const line = index + 2; // Zeile 1 ist die Kopfzeile
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(record)) lower[k.trim().toLowerCase()] = v.trim();
    const plz = (lower.plz ?? "").padStart(5, "0");
    const fail = (error: string) => issues.push({ line, plz, error });

    const row = mapRow(record);
    if (!row) return fail("PLZ fehlt oder Ort ohne Koordinate");
    if (seen.has(row.postal_code)) return fail("PLZ doppelt");
    seen.add(row.postal_code);

    if (row.strom_ct_kwh === null && row.gas_ct_kwh === null) {
      return fail("weder Strom- noch Gaspreis");
    }
    for (const [key, [min, max]] of Object.entries(LIMITS)) {
      const value = row[key as keyof typeof LIMITS];
      if (value !== null && (value < min || value > max)) {
        fail(`${key} = ${value} liegt ausserhalb ${min}–${max}`);
      }
    }
    if (!/^https?:\/\//.test(lower.quelle_url ?? "")) fail("quelle_url fehlt");

    const checked = lower.geprueft_am ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checked)) {
      fail("geprueft_am fehlt (JJJJ-MM-TT)");
      stale.push(row.postal_code);
    } else {
      const age = (today.getTime() - new Date(`${checked}T00:00:00Z`).getTime()) / 86_400_000;
      if (age < -1) fail("geprueft_am liegt in der Zukunft");
      if (age > maxAgeDays) stale.push(row.postal_code);
    }
    rows.push(row);
  });

  return { rows, issues, stale };
}
