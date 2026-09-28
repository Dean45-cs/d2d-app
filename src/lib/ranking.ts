import type { PersonTotals } from "./community";

/*
 * Rangliste und Motivation - reine Rechnerei ohne Datenbank.
 *
 * Grundsatz: verglichen wird nur, was fair vergleichbar ist. Eine Quote aus
 * drei Gespraechen sagt nichts; wer darunter bleibt, steht in der Liste,
 * aber ohne Platz ("zu wenig Daten") - sonst fuehrt, wer einmal Glueck hatte.
 */

export type MetricKey = "sales" | "appointments" | "doors" | "close_rate" | "meet_rate";

export interface Metric {
  key: MetricKey;
  label: string;
  /** Einheit fuer Saetze wie "noch 3 Abschlüsse". */
  one: string;
  many: string;
  rate?: { num: "sales" | "met"; den: "met" | "doors"; min: number; basis: string };
}

export const METRICS: Metric[] = [
  { key: "sales", label: "Abschlüsse", one: "Abschluss", many: "Abschlüsse" },
  { key: "appointments", label: "Termine", one: "Termin", many: "Termine" },
  { key: "doors", label: "Türen", one: "Tür", many: "Türen" },
  {
    key: "close_rate",
    label: "Abschlussquote",
    one: "Prozentpunkt",
    many: "Prozentpunkte",
    rate: { num: "sales", den: "met", min: 5, basis: "Gespräche" },
  },
  {
    key: "meet_rate",
    label: "Antreffquote",
    one: "Prozentpunkt",
    many: "Prozentpunkte",
    rate: { num: "met", den: "doors", min: 20, basis: "Türen" },
  },
];

export function metricByKey(key: string | undefined): Metric {
  return METRICS.find((m) => m.key === key) ?? METRICS[0];
}

/** Wert einer Kennzahl; null, wenn die Quote auf zu wenig Daten beruht. */
export function metricValue(metric: Metric, t: PersonTotals): number | null {
  if (!metric.rate) return t[metric.key as "sales" | "appointments" | "doors"];
  const den = t[metric.rate.den];
  if (den < metric.rate.min) return null;
  return (t[metric.rate.num] / den) * 100;
}

export function formatMetric(metric: Metric, value: number | null): string {
  if (value === null) return "–";
  if (metric.rate) return `${Math.round(value)} %`;
  return value.toLocaleString("de-DE");
}

export interface RankEntry extends PersonTotals {
  value: number | null;
  /** Platz; gleiche Werte teilen sich den Platz ("1, 2, 2, 4"). null = ohne Wertung. */
  rank: number | null;
}

/**
 * Wer in die Wertung kommt: der Vertrieb immer, die Teamleitung nur, wenn
 * sie im Zeitraum selbst an Tueren war - sonst stuende sie mit lauter Nullen
 * am Ende und druckte nur die Plaetze der anderen.
 */
export function contenders(totals: PersonTotals[]): PersonTotals[] {
  return totals.filter((t) => t.role !== "LEADER" || t.doors > 0);
}

export function rank(metric: Metric, totals: PersonTotals[]): RankEntry[] {
  const entries = contenders(totals).map((t) => ({ ...t, value: metricValue(metric, t), rank: null }));
  const ranked = entries
    .filter((e) => e.value !== null)
    .sort((a, b) => b.value! - a.value! || b.sales - a.sales || a.user_name.localeCompare(b.user_name, "de"));
  let previous: number | null = null;
  let place = 0;
  ranked.forEach((entry, index) => {
    if (entry.value !== previous) place = index + 1;
    previous = entry.value;
    (entry as RankEntry).rank = place;
  });
  const unranked = entries
    .filter((e) => e.value === null)
    .sort((a, b) => a.user_name.localeCompare(b.user_name, "de"));
  return [...ranked, ...unranked] as RankEntry[];
}

/** Durchschnitt des Teams - bei Quoten ueber alle Tueren gerechnet, nicht als Mittel der Quoten. */
export function teamAverage(metric: Metric, totals: PersonTotals[]): number | null {
  const people = contenders(totals);
  if (people.length === 0) return null;
  if (metric.rate) {
    const num = people.reduce((sum, t) => sum + t[metric.rate!.num], 0);
    const den = people.reduce((sum, t) => sum + t[metric.rate!.den], 0);
    return den > 0 ? (num / den) * 100 : null;
  }
  const key = metric.key as "sales" | "appointments" | "doors";
  return people.reduce((sum, t) => sum + t[key], 0) / people.length;
}

export function bestValue(entries: RankEntry[]): number | null {
  const values = entries.map((e) => e.value).filter((v): v is number => v !== null);
  return values.length ? Math.max(...values) : null;
}

/**
 * Der Satz unter dem eigenen Platz: wie weit es bis zum naechsten ist - oder
 * wie gross der Vorsprung. Das ist die eigentliche Motivation der Seite.
 */
export function chaseLine(metric: Metric, entries: RankEntry[], userId: number): string | null {
  const me = entries.find((e) => e.user_id === userId);
  if (!me || me.rank === null || me.value === null) return null;
  const ranked = entries.filter((e) => e.rank !== null);

  // Morgens um acht stehen alle bei null - das ist kein geteilter erster Platz.
  if (!metric.rate && ranked.every((e) => e.value === 0)) {
    return `Noch keine ${metric.many} im Zeitraum – Platz 1 ist frei.`;
  }

  if (me.rank === 1) {
    const tied = ranked.filter((e) => e.rank === 1 && e.user_id !== userId);
    if (tied.length > 0) return `Gleichauf mit ${firstName(tied[0].user_name)} an der Spitze.`;
    const second = ranked.find((e) => e.rank !== 1);
    if (!second || second.value === null) return "Du führst.";
    return `Du führst – ${gap(metric, me.value - second.value)} Vorsprung vor ${firstName(second.user_name)}.`;
  }

  // Die Person direkt vor mir: der naechste Platz, nicht der Erste.
  const ahead = [...ranked].reverse().find((e) => e.rank! < me.rank!);
  if (!ahead || ahead.value === null) return null;
  const diff = ahead.value - me.value;
  if (metric.rate) {
    return `${gap(metric, diff)} hinter ${firstName(ahead.user_name)} auf Platz ${ahead.rank}.`;
  }
  // Bei Stueckzahlen: einer mehr als der Abstand, und man ist vorbei.
  const needed = Math.round(diff) + 1;
  return `Noch ${needed} ${needed === 1 ? metric.one : metric.many} und du überholst ${firstName(ahead.user_name)} (Platz ${ahead.rank}).`;
}

function gap(metric: Metric, diff: number): string {
  if (metric.rate) {
    const points = Math.max(1, Math.round(diff));
    return `${points} ${points === 1 ? metric.one : metric.many}`;
  }
  const n = Math.round(diff);
  return `${n} ${n === 1 ? metric.one : metric.many}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/* ============================== Meilensteine ============================= */

/** Abzeichen fuer die Gesamtzahl der Abschluesse. */
export const MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

export function milestoneProgress(sales: number): {
  reached: number[];
  next: number | null;
  /** Wo der Balken zum naechsten Abzeichen beginnt. */
  from: number;
} {
  const reached = MILESTONES.filter((m) => sales >= m);
  const next = MILESTONES.find((m) => sales < m) ?? null;
  return { reached, next, from: reached.at(-1) ?? 0 };
}

/** Ist dieser Abschluss ein runder? Fuer die Plakette im Feed und die Push-Nachricht. */
export function isMilestone(number: number): boolean {
  return MILESTONES.includes(number) && number > 1;
}

/**
 * Serie: an wie vielen Arbeitstagen in Folge es mindestens einen Abschluss
 * gab. Tage ohne Tueren (Wochenende, Urlaub) unterbrechen nicht - ein Tag an
 * der Tuer ohne Vertrag schon. Ein laufender Tag ohne Abschluss zaehlt noch
 * nicht als verloren.
 */
export function saleStreak(
  days: Array<{ day: string; doors: number; sales: number }>,
  today: string,
): number {
  let streak = 0;
  for (const [index, day] of days.entries()) {
    if (index === 0 && day.day === today && day.sales === 0) continue;
    if (day.sales > 0) streak += 1;
    else break;
  }
  return streak;
}
