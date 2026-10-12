import { OUTCOME_LABEL, type VisitOutcome } from "./types";

/** Pro Besuch gilt genau ein Ergebnis. Ein Abschluss bringt insgesamt 100 XP. */
export const XP_RULES: Array<{
  outcome: VisitOutcome;
  label: string;
  xp: number;
  description: string;
}> = [
  { outcome: "NOT_HOME", label: OUTCOME_LABEL.NOT_HOME, xp: 5, description: "Auch ein dokumentierter Versuch zählt." },
  { outcome: "MET_NO_SALE", label: OUTCOME_LABEL.MET_NO_SALE, xp: 15, description: "Jedes echte Gespräch bringt Erfahrung." },
  { outcome: "APPOINTMENT", label: OUTCOME_LABEL.APPOINTMENT, xp: 40, description: "Ein vereinbarter Termin ist der nächste Schritt." },
  { outcome: "SALE", label: OUTCOME_LABEL.SALE, xp: 100, description: "Ein dokumentierter Abschluss wird belohnt." },
];

export const LEVEL_TITLES = [
  { level: 1, title: "Einstieg" },
  { level: 5, title: "Türöffner" },
  { level: 10, title: "Gesprächsprofi" },
  { level: 20, title: "Abschlussprofi" },
  { level: 30, title: "Gebietskenner" },
  { level: 50, title: "Vertriebsmeister" },
  { level: 75, title: "Legende" },
];

export interface LevelProgress {
  totalXp: number;
  level: number;
  title: string;
  levelStartXp: number;
  nextLevelXp: number;
  xpInLevel: number;
  xpForNextLevel: number;
  xpToNextLevel: number;
  percent: number;
}

export interface LevelTotals {
  doors: number;
  met: number;
  appointments: number;
  sales: number;
}

export function xpForOutcome(outcome: VisitOutcome): number {
  return XP_RULES.find((rule) => rule.outcome === outcome)?.xp ?? 0;
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value))) : 0;
}

/** Kumulierte Schwelle: 0, 100, 250, 450 …; jedes weitere Level kostet 50 XP mehr. */
function threshold(level: number): number {
  return 25 * (level - 1) * (level + 2);
}

/** Benötigte Gesamt-XP für ein Level, z. B. für den Titel-Ausblick. */
export function xpForLevel(level: number): number {
  return threshold(Math.max(1, nonNegativeInteger(level)));
}

export function levelProgress(xp: number): LevelProgress {
  const totalXp = nonNegativeInteger(xp);
  // Inverse der quadratischen Kurve, damit auch sehr große Werte sofort berechnet werden.
  let level = Math.floor((Math.sqrt(9 + (4 * totalXp) / 25) - 3) / 2) + 1;
  // Gleitkomma-Rundung direkt an einer Schwelle korrigieren.
  if (threshold(level) > totalXp) level -= 1;
  if (threshold(level + 1) <= totalXp) level += 1;
  const levelStartXp = threshold(level);
  const nextLevelXp = threshold(level + 1);
  const xpInLevel = totalXp - levelStartXp;
  const xpForNextLevel = nextLevelXp - levelStartXp;
  return {
    totalXp,
    level,
    title: LEVEL_TITLES.findLast((entry) => entry.level <= level)!.title,
    levelStartXp,
    nextLevelXp,
    xpInLevel,
    xpForNextLevel,
    xpToNextLevel: nextLevelXp - totalXp,
    percent: (xpInLevel / xpForNextLevel) * 100,
  };
}

/** Schwierigkeit ist eine redaktionelle Zielstaffel, kein Branchenbenchmark. */
export const ACHIEVEMENT_TIERS = [
  { id: "bronze", label: "Bronze", difficulty: "Leicht", description: "Deine ersten Schritte im Vertrieb.", order: 1 },
  { id: "silver", label: "Silber", difficulty: "Mittel", description: "Aus ersten Erfolgen wird Routine.", order: 2 },
  { id: "gold", label: "Gold", difficulty: "Anspruchsvoll", description: "Erfahrung, die sich sehen lassen kann.", order: 3 },
  { id: "platinum", label: "Platin", difficulty: "Schwer", description: "Starke Ergebnisse über viele Touren.", order: 4 },
  { id: "diamond", label: "Diamant", difficulty: "Sehr schwer", description: "Langfristige Meilensteine und besondere Bestleistungen.", order: 5 },
] as const;

export type AchievementTier = (typeof ACHIEVEMENT_TIERS)[number]["id"];
export const ACHIEVEMENT_CATEGORIES = [
  { id: "activity", label: "Türen & Gespräche" },
  { id: "appointments", label: "Termine" },
  { id: "sales", label: "Abschlüsse" },
  { id: "energy", label: "Strom & Gas" },
  { id: "consistency", label: "Beständigkeit" },
] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number]["id"];

export interface AchievementStats extends LevelTotals {
  stromSales: number;
  gasSales: number;
  dualSales: number;
  completedAppointments: number;
  activeDays: number;
  saleDays: number;
  bestDaySales: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  current: number;
  target: number;
  unlocked: boolean;
  kind: keyof AchievementStats;
  category: AchievementCategory;
  tier: AchievementTier;
  /** Explizite, stabile Reihenfolge innerhalb derselben Schwierigkeit. */
  order: number;
  unit: string;
}

type AchievementDefinition = Omit<Achievement, "current" | "unlocked">;

function series(
  kind: keyof AchievementStats,
  category: AchievementCategory,
  unit: string,
  entries: Array<[target: number, tier: AchievementTier, title: string]>,
  description: (target: number) => string,
): AchievementDefinition[] {
  return entries.map(([target, tier, title], index) => ({
    id: `${kind}-${target}`, kind, category, unit, target, tier, title,
    description: description(target), order: index,
  }));
}
const n = (value: number) => value.toLocaleString("de-DE");

const ACHIEVEMENTS: AchievementDefinition[] = [
  ...series("doors", "activity", "Türbesuche", [
    [1, "bronze", "Der erste Schritt"], [100, "silver", "Hundert Türen"],
    [1000, "gold", "Gebietserfahrung"], [5000, "platinum", "Straße für Straße"], [10000, "diamond", "Zehntausend Chancen"],
  ], (target) => `Dokumentiere ${n(target)} ${target === 1 ? "Türbesuch" : "Türbesuche"}.`),
  ...series("met", "activity", "Gespräche", [
    [10, "bronze", "Im Gespräch"], [100, "silver", "Guter Draht"],
    [500, "gold", "Menschenkenner"], [1000, "platinum", "Tausend Begegnungen"], [2500, "diamond", "Ein offenes Ohr"],
  ], (target) => `Führe ${n(target)} Gespräche an der Tür.`),
  ...series("appointments", "appointments", "Termine", [
    [1, "bronze", "Wir sehen uns"], [10, "silver", "Kalender füllt sich"],
    [50, "gold", "Gefragter Kontakt"], [100, "platinum", "Auf Wiedervorlage"], [250, "diamond", "Terminprofi"],
  ], (target) => `Vereinbare ${n(target)} ${target === 1 ? "Termin" : "Termine"}.`),
  ...series("sales", "sales", "Abschlüsse", [
    [1, "bronze", "Erster Abschluss"], [10, "silver", "Abschlussstark"],
    [50, "gold", "Fünfzig Erfolge"], [100, "platinum", "Hundert Erfolge"], [500, "diamond", "Vertriebslegende"],
  ], (target) => `Dokumentiere insgesamt ${n(target)} ${target === 1 ? "Abschluss" : "Abschlüsse"}.`),
  ...series("stromSales", "energy", "Stromabschlüsse", [
    [1, "bronze", "Erster Funke"], [10, "silver", "Unter Strom"],
    [50, "gold", "Spannung steigt"], [100, "platinum", "Volle Leistung"], [250, "diamond", "Kraftwerk"],
  ], (target) => `Erfasse ${n(target)} ${target === 1 ? "Abschluss" : "Abschlüsse"} mit Strom. „Beides“ zählt mit.`),
  ...series("gasSales", "energy", "Gasabschlüsse", [
    [1, "bronze", "Erste Flamme"], [10, "silver", "Wärmebringer"],
    [25, "gold", "Feuer gefangen"], [50, "platinum", "Auf Betriebstemperatur"], [100, "diamond", "Wärmeprofi"],
  ], (target) => `Erfasse ${n(target)} ${target === 1 ? "Abschluss" : "Abschlüsse"} mit Gas. „Beides“ zählt mit.`),
  ...series("dualSales", "energy", "Kombiabschlüsse", [
    [1, "silver", "Doppelte Energie"], [10, "gold", "Das starke Duo"],
    [25, "platinum", "Alles aus einer Hand"], [50, "diamond", "Doppelte Expertise"],
  ], (target) => `Erfasse ${n(target)} ${target === 1 ? "Abschluss" : "Abschlüsse"} mit „Beides“: Strom und Gas bei einem Besuch.`),
  ...series("completedAppointments", "appointments", "erledigte Termine", [
    [1, "bronze", "Nachgefasst"], [10, "silver", "Den Faden halten"],
    [50, "gold", "Dranbleiber"], [100, "platinum", "Der Kreis schließt sich"],
  ], (target) => `Markiere ${n(target)} ${target === 1 ? "vereinbarten Termin" : "vereinbarte Termine"} als erledigt. Ein Abschluss ist dafür nicht nötig.`),
  ...series("activeDays", "consistency", "aktive Tage", [
    [5, "bronze", "Gut unterwegs"], [20, "silver", "In Bewegung"],
    [60, "gold", "Fester Rhythmus"], [120, "platinum", "Langer Atem"], [250, "diamond", "Ausdauer-Champion"],
  ], (target) => `Erfasse an ${n(target)} verschiedenen Tagen mindestens einen Besuch. Pausen sind erlaubt.`),
  ...series("saleDays", "consistency", "Abschlusstage", [
    [3, "silver", "Wieder geschafft"], [10, "gold", "Erfolg hat Routine"],
    [50, "platinum", "Beständig stark"], [100, "diamond", "Hundert gute Tage"],
  ], (target) => `Erziele an ${n(target)} verschiedenen Tagen mindestens einen Abschluss. Die Tage müssen nicht aufeinanderfolgen.`),
  ...series("bestDaySales", "sales", "Abschlüsse an einem Tag", [
    [3, "gold", "Dreierpack"], [5, "platinum", "Sternstunde"], [10, "diamond", "Außergewöhnlicher Tag"],
  ], (target) => `Dokumentiere ${n(target)} Abschlüsse an einem Kalendertag in Berlin. Dein bester Tag zählt.`),
].map((entry, index) => ({ ...entry, order: index }));

export function achievementTier(tier: AchievementTier) {
  return ACHIEVEMENT_TIERS.find((entry) => entry.id === tier)!;
}

/** Einfach zuerst; innerhalb einer Stufe bleibt die Katalogreihenfolge stabil. */
export function sortAchievements(achievements: Achievement[]): Achievement[] {
  return [...achievements].sort((a, b) => achievementTier(a.tier).order - achievementTier(b.tier).order || a.order - b.order);
}

/** Abzeichen werden aus bestehenden Besuchen abgeleitet und vergeben keine zusätzlichen XP. */
export function achievementsFor(totals: LevelTotals & Partial<AchievementStats>): Achievement[] {
  return sortAchievements(ACHIEVEMENTS.map((entry) => {
    const current = nonNegativeInteger(totals[entry.kind] ?? 0);
    return { ...entry, current, unlocked: current >= entry.target };
  }));
}

export interface DailyGoal {
  id: string;
  title: string;
  current: number;
  target: number;
  completed: boolean;
}

/** Tagesziele motivieren; XP gibt es ausschließlich für die dokumentierten Besuche. */
export function dailyGoalsFor(totals: LevelTotals): DailyGoal[] {
  return [
    { id: "doors", title: "20 Türen besuchen", current: nonNegativeInteger(totals.doors), target: 20 },
    { id: "met", title: "5 Gespräche führen", current: nonNegativeInteger(totals.met), target: 5 },
    { id: "sales", title: "1 Abschluss erzielen", current: nonNegativeInteger(totals.sales), target: 1 },
  ].map((goal) => ({ ...goal, completed: goal.current >= goal.target }));
}
