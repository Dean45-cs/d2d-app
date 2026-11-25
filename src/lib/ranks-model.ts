import type { Tier } from "./types";
import { berlinParts, berlinWallToSql } from "./format";
import { TIERS, nextTier, previousTier, rankLabel, type RankSetup } from "./tiers";

/*
 * Ziele fuer den Aufstieg - ohne Datenbank, laeuft auch im Browser.
 *
 * Ein Ziel haengt am Zielrang ("Um Teamleiter zu werden ..."). Alle Ziele
 * eines Rangs muessen erfuellt sein; befoerdert wird trotzdem von Hand. Die
 * Zahlen zaehlt ranks.ts aus der Datenbank, hier wird nur verglichen und
 * beschriftet.
 */

export type GoalKind = "SALES" | "STROM" | "GAS" | "MONTHS" | "TEAM_SIZE" | "TEAM_SUM" | "TEAM_AVG";
export type GoalPeriod = "SINCE_RANK" | "LAST_MONTHS" | "MONTH" | "QUARTER";

export const GOAL_KINDS: readonly GoalKind[] = ["SALES", "STROM", "GAS", "MONTHS", "TEAM_SIZE", "TEAM_SUM", "TEAM_AVG"];
export const GOAL_PERIODS: readonly GoalPeriod[] = ["SINCE_RANK", "LAST_MONTHS", "MONTH", "QUARTER"];

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  SALES: "Abschlüsse",
  STROM: "Strom-Abschlüsse",
  GAS: "Gas-Abschlüsse",
  MONTHS: "Zeit im Rang",
  TEAM_SIZE: "Teamgröße",
  TEAM_SUM: "Abschlüsse im Team",
  TEAM_AVG: "Ø Abschlüsse je Person im Team",
};

/** Ein Satz unter der Zielart im Formular - was genau gezaehlt wird. */
export const GOAL_KIND_HINT: Record<GoalKind, string> = {
  SALES: "Eigene Abschlüsse. Strom + Gas beim selben Kunden zählt doppelt.",
  STROM: "Eigene Abschlüsse mit Strom, auch Kombi.",
  GAS: "Eigene Abschlüsse mit Gas, auch Kombi.",
  MONTHS: "Volle Monate seit dem letzten Rangwechsel.",
  TEAM_SIZE: "Aktive Leute direkt unter der Person.",
  TEAM_SUM: "Alle Abschlüsse der direkten Leute zusammen.",
  TEAM_AVG: "Abschlüsse der direkten Leute geteilt durch ihre Anzahl.",
};

export const GOAL_PERIOD_LABEL: Record<GoalPeriod, string> = {
  SINCE_RANK: "seit letztem Aufstieg",
  LAST_MONTHS: "letzte Monate",
  MONTH: "laufender Monat",
  QUARTER: "laufendes Quartal",
};

export interface RankGoal {
  id: number;
  /** Der Rang, in den man mit diesem Ziel aufsteigt. */
  tier: Tier;
  kind: GoalKind;
  target: number;
  period: GoalPeriod;
  /** Nur bei LAST_MONTHS: wie viele Monate zurueck. */
  months: number | null;
}

export function isGoalKind(value: unknown): value is GoalKind {
  return typeof value === "string" && (GOAL_KINDS as readonly string[]).includes(value);
}

export function isGoalPeriod(value: unknown): value is GoalPeriod {
  return typeof value === "string" && (GOAL_PERIODS as readonly string[]).includes(value);
}

/** Zaehlt ueber einen Zeitraum - Zeit im Rang und Teamgroesse sind ein Stand, kein Zeitraum. */
export function goalUsesPeriod(kind: GoalKind): boolean {
  return kind !== "MONTHS" && kind !== "TEAM_SIZE";
}

export function isTeamGoal(kind: GoalKind): boolean {
  return kind === "TEAM_SIZE" || kind === "TEAM_SUM" || kind === "TEAM_AVG";
}

/**
 * Team-Ziele fuer einen Zielrang gehen nur, wenn der Rang darunter schon ein
 * Team haben darf - sonst koennte sie niemand erreichen.
 */
export function teamGoalsPossible(tier: Tier, ranks: RankSetup): boolean {
  const below = previousTier(tier);
  return below !== null && ranks[below].team;
}

/** "letzte 3 Monate", "laufender Monat" */
export function periodLabel(goal: Pick<RankGoal, "period" | "months">): string {
  if (goal.period === "LAST_MONTHS") {
    const months = goal.months ?? 1;
    return months === 1 ? "letzter Monat" : `letzte ${months} Monate`;
  }
  return GOAL_PERIOD_LABEL[goal.period];
}

function number(value: number): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

/** "50 Abschlüsse", "3 Monate im Rang", "3 Leute im Team", "Ø 8 Abschlüsse je Person im Team" */
export function goalTitle(goal: Pick<RankGoal, "kind" | "target">): string {
  const n = number(goal.target);
  switch (goal.kind) {
    case "SALES":
      return goal.target === 1 ? "1 Abschluss" : `${n} Abschlüsse`;
    case "STROM":
      return goal.target === 1 ? "1 Strom-Abschluss" : `${n} Strom-Abschlüsse`;
    case "GAS":
      return goal.target === 1 ? "1 Gas-Abschluss" : `${n} Gas-Abschlüsse`;
    case "MONTHS":
      return goal.target === 1 ? "1 Monat im Rang" : `${n} Monate im Rang`;
    case "TEAM_SIZE":
      return goal.target === 1 ? "1 Person im Team" : `${n} Leute im Team`;
    case "TEAM_SUM":
      return goal.target === 1 ? "1 Abschluss im Team" : `${n} Abschlüsse im Team`;
    case "TEAM_AVG":
      return `Ø ${n} Abschlüsse je Person im Team`;
  }
}

/** "50 Abschlüsse · seit letztem Aufstieg" - fuer Listen. */
export function goalSummary(goal: RankGoal): string {
  return goalUsesPeriod(goal.kind) ? `${goalTitle(goal)} · ${periodLabel(goal)}` : goalTitle(goal);
}

/** Ganze Zahlen ausser beim Durchschnitt. */
export function goalTargetValid(kind: GoalKind, target: number): boolean {
  if (!Number.isFinite(target) || target <= 0 || target > 100_000) return false;
  return kind === "TEAM_AVG" ? Math.round(target * 10) === target * 10 : Number.isInteger(target);
}

/* ------------------------------- Zeitraeume ------------------------------ */

/**
 * Ab wann ein Ziel zaehlt - als SQLite-Zeitstempel in UTC. Monate und
 * Quartale beginnen am Ersten um Mitternacht in Berlin; "letzte 3 Monate"
 * reicht bis zum selben Kalendertag drei Monate zurueck.
 */
export function periodStart(goal: Pick<RankGoal, "period" | "months">, rankSince: string, now = new Date()): string {
  const { year, month, day } = berlinParts(now);
  switch (goal.period) {
    case "SINCE_RANK":
      return rankSince;
    case "LAST_MONTHS": {
      const months = Math.max(1, goal.months ?? 1);
      const target = Date.UTC(year, month - 1 - months, 1);
      const probe = new Date(target);
      // Ende des Monats beachten: vom 31.05. drei Monate zurueck ist der 28./29.02.
      const lastDay = new Date(Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth() + 1, 0)).getUTCDate();
      return berlinWallToSql(Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), Math.min(day, lastDay)));
    }
    case "MONTH":
      return berlinWallToSql(Date.UTC(year, month - 1, 1));
    case "QUARTER":
      return berlinWallToSql(Date.UTC(year, Math.floor((month - 1) / 3) * 3, 1));
  }
}

/** Volle Monate zwischen zwei Zeitpunkten, im Berliner Kalender. */
export function fullMonthsBetween(since: Date, now = new Date()): number {
  if (now <= since) return 0;
  const a = berlinParts(since);
  const b = berlinParts(now);
  const months = (b.year - a.year) * 12 + (b.month - a.month) - (b.day < a.day ? 1 : 0);
  return Math.max(0, months);
}

/** SQLite-Zeitstempel ("2026-11-25 08:00:00", UTC) als Date. */
export function sqlDate(value: string): Date {
  return new Date(`${value.replace(" ", "T")}${/Z|[+-]\d\d:?\d\d$/.test(value) ? "" : "Z"}`);
}

/* ------------------------------- Fortschritt ----------------------------- */

export interface GoalProgress {
  goal: RankGoal;
  value: number;
  met: boolean;
  /** 0 bis 1 - fuer den Balken. */
  ratio: number;
}

export interface RankProgress {
  tier: Tier;
  /** Der Rang darueber; null ganz oben. */
  next: Tier | null;
  goals: GoalProgress[];
  /** Alle Ziele erfuellt - es gibt mindestens eines. */
  ready: boolean;
  /** Seit wann die Person ihren Rang hat (SQLite-Zeitstempel, UTC). */
  since: string;
}

export function evaluateGoals(goals: RankGoal[], valueOf: (goal: RankGoal) => number): GoalProgress[] {
  return goals.map((goal) => {
    const value = Math.max(0, valueOf(goal));
    return { goal, value, met: value >= goal.target, ratio: goal.target > 0 ? Math.min(1, value / goal.target) : 1 };
  });
}

export function buildProgress(tier: Tier, since: string, goals: RankGoal[], valueOf: (goal: RankGoal) => number): RankProgress {
  const next = nextTier(tier);
  const evaluated = next ? evaluateGoals(goals.filter((goal) => goal.tier === next), valueOf) : [];
  return { tier, next, goals: evaluated, ready: evaluated.length > 0 && evaluated.every((entry) => entry.met), since };
}

/** "3 von 4 Zielen" */
export function progressSummary(progress: RankProgress): string {
  const met = progress.goals.filter((entry) => entry.met).length;
  return `${met} von ${progress.goals.length} ${progress.goals.length === 1 ? "Ziel" : "Zielen"}`;
}

/** Wie weit insgesamt - der Mittelwert der Balken, fuer die Karte. */
export function progressRatio(progress: RankProgress): number {
  if (progress.goals.length === 0) return 0;
  return progress.goals.reduce((sum, entry) => sum + entry.ratio, 0) / progress.goals.length;
}

/** "38 / 50", "Ø 6,5 / 8", "2 / 3 Monate" */
export function goalValueText(entry: GoalProgress): string {
  const value = entry.goal.kind === "TEAM_AVG" ? number(Math.round(entry.value * 10) / 10) : number(Math.floor(entry.value));
  return `${value} / ${number(entry.goal.target)}`;
}

/** Die Sprossen der Leiter von oben nach unten - mit Namen aus den Einstellungen. */
export function ladderTiers(ranks: RankSetup): Array<{ tier: Tier; label: string; team: boolean }> {
  return [...TIERS].reverse().map((tier) => ({ tier, label: rankLabel(tier, ranks), team: ranks[tier].team }));
}

/* ------------------------------ Fuer die Anzeige ---------------------------- */

/** Ein Ziel, fertig beschriftet - so verlaesst es den Server. */
export interface CareerGoal {
  id: number;
  title: string;
  period: string | null;
  value: string;
  met: boolean;
  ratio: number;
}

/** Rang und Fortschritt einer Person, fertig beschriftet. */
export interface CareerSummary {
  tier: Tier;
  label: string;
  next: Tier | null;
  nextLabel: string | null;
  ready: boolean;
  goals: CareerGoal[];
  /** 0 bis 1 ueber alle Ziele. */
  ratio: number;
  /** "3 von 4 Zielen" */
  summary: string;
}

export function careerSummary(progress: RankProgress, ranks: RankSetup): CareerSummary {
  return {
    tier: progress.tier,
    label: rankLabel(progress.tier, ranks),
    next: progress.next,
    nextLabel: progress.next ? rankLabel(progress.next, ranks) : null,
    ready: progress.ready,
    goals: progress.goals.map((entry) => ({
      id: entry.goal.id,
      title: goalTitle(entry.goal),
      period: goalUsesPeriod(entry.goal.kind) ? periodLabel(entry.goal) : null,
      value: goalValueText(entry),
      met: entry.met,
      ratio: entry.ratio,
    })),
    ratio: progressRatio(progress),
    summary: progressSummary(progress),
  };
}
