/**
 * Vertragslaufzeiten der Kundenliste - Regeln, die Oberflaeche und Server teilen.
 *
 * Ein Abschluss an der Tuer ist ein Vertrag mit Lieferbeginn und Laufzeit.
 * Laeuft er aus, kann der Kunde wechseln - genau dann soll ihn das Team
 * wieder anrufen oder besuchen und neu beraten. Damit das niemand verpasst,
 * erscheint er rechtzeitig vorher unter "Fällig".
 *
 * Gespeichert wird der Kalendertag als Text ("2027-10-31"): ohne Uhrzeit und
 * Zeitzone, und in SQL direkt vergleichbar.
 */

/** So lange vor Vertragsende steht ein Kunde unter "Fällig" - Zeit genug, den Wechsel vorzubereiten. */
export const RECALL_LEAD_DAYS = 60;

/** Laufzeiten zur Auswahl, in Monaten. */
export const CONTRACT_TERMS = [1, 3, 6, 12, 18, 24, 36] as const;

const ISO_DAY = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const GERMAN_DAY = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/**
 * Bringt eine Eingabe auf "YYYY-MM-DD" - leer, wenn sie nicht passt. Nimmt
 * auch "31.10.2027": so steht ein Datum im Buchungsportal und in Excel.
 */
export function normalizeDay(raw: unknown): string {
  const text = String(raw ?? "").trim().slice(0, 10);
  const iso = ISO_DAY.exec(text);
  const german = GERMAN_DAY.exec(text);
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : german
      ? [Number(german[3]), Number(german[2]), Number(german[1])]
      : [0, 0, 0];
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return "";
  // Ueber den Kalender gegengeprueft: der 31. Februar faellt hier raus.
  if (d > daysInMonth(y, m)) return "";
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Letzter Vertragstag: Lieferbeginn plus Laufzeit, einen Tag davor.
 * 1.11.2026 mit 12 Monaten endet am 31.10.2027. Gibt es den Tag im letzten
 * Monat nicht (Beginn am 31.1., ein Monat), endet der Vertrag an dessen
 * Monatsletztem - wie Fristen nach BGB.
 */
export function contractEnd(start: string, months: number): string {
  const day = normalizeDay(start);
  if (!day || !Number.isInteger(months) || months < 1 || months > 120) return "";
  const [y, m, d] = day.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = daysInMonth(year, month);
  if (d > last) return `${year}-${pad(month)}-${pad(last)}`;
  return addDays(`${year}-${pad(month)}-${pad(d)}`, -1);
}

/** Kalendertag verschieben - ohne Umweg ueber die Ortszeit des Geraets. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Heute in Berlin als "YYYY-MM-DD" - der Server laeuft in UTC. */
export function berlinToday(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

/** Bis zu diesem Tag endende Vertraege sind faellig. */
export function recallUntil(today: string): string {
  return addDays(today, RECALL_LEAD_DAYS);
}

/** "31.10.2027" */
export function dayLabel(day: string | null): string {
  const normalized = normalizeDay(day);
  if (!normalized) return "";
  const [y, m, d] = normalized.split("-");
  return `${d}.${m}.${y}`;
}

/** Ganze Tage von heute bis zum Tag - negativ, wenn er vorbei ist. */
export function daysUntil(day: string, today: string): number {
  const toUtc = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(day) - toUtc(today)) / 86_400_000);
}

/**
 * Wo ein Vertrag steht, in einem Satz fuer die Liste:
 * "Endete am 31.10.2027", "Endet in 12 Tagen", "Läuft bis 31.10.2027".
 */
export function contractStatus(
  end: string | null,
  today: string,
): { tone: "ended" | "due" | "running" | "unknown"; label: string } {
  const day = normalizeDay(end);
  if (!day) return { tone: "unknown", label: "Vertragsende fehlt" };
  const days = daysUntil(day, today);
  if (days < 0) return { tone: "ended", label: `Endete am ${dayLabel(day)}` };
  if (days === 0) return { tone: "due", label: "Endet heute" };
  if (days === 1) return { tone: "due", label: "Endet morgen" };
  if (days <= RECALL_LEAD_DAYS) {
    return { tone: "due", label: days < 28 ? `Endet in ${days} Tagen` : `Endet am ${dayLabel(day)}` };
  }
  return { tone: "running", label: `Läuft bis ${dayLabel(day)}` };
}

/** "Strom + Gas" - das Produkt eines Abschlusses. */
export function productLabel(value: string): string {
  if (value === "BEIDES") return "Strom + Gas";
  if (value === "STROM") return "Strom";
  if (value === "GAS") return "Gas";
  return "";
}

/** Rufnummer fuer tel: - nur Ziffern und ein fuehrendes Plus. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
