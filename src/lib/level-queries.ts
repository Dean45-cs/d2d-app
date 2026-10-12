import { getDb } from "./db";
import {
  achievementsFor,
  dailyGoalsFor,
  levelProgress,
  xpForOutcome,
  XP_RULES,
  type Achievement,
  type AchievementStats,
  type DailyGoal,
  type LevelProgress,
  type LevelTotals,
} from "./levels";
import { OUTCOME_LABEL, type VisitOutcome } from "./types";

/** Nur vertrauenswürdige Regel-Konstanten werden hier in SQL eingesetzt. */
const XP_SQL = `CASE v.outcome ${XP_RULES.map((rule) => `WHEN '${rule.outcome}' THEN ${rule.xp}`).join(" ")} ELSE 0 END`;
const TOTALS_SQL = `COUNT(v.id) AS doors,
  COALESCE(SUM(v.outcome IN ('MET_NO_SALE', 'APPOINTMENT', 'SALE')), 0) AS met,
  COALESCE(SUM(v.outcome = 'APPOINTMENT'), 0) AS appointments,
  COALESCE(SUM(v.outcome = 'SALE'), 0) AS sales,
  COALESCE(SUM(${XP_SQL}), 0) AS totalXp`;

interface TotalsRow extends LevelTotals {
  totalXp: number;
}

export interface LevelLeaderboardEntry {
  userId: number;
  name: string;
  avatar: string;
  rank: number;
  progress: LevelProgress;
}

export interface LevelDashboard {
  progress: LevelProgress;
  totals: LevelTotals;
  todayXp: number;
  goals: DailyGoal[];
  achievements: Achievement[];
  history: Array<{ id: number; outcome: VisitOutcome; label: string; xp: number; createdAt: string }>;
  leaderboard: LevelLeaderboardEntry[];
}

const berlinFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function berlinParts(date: Date) {
  const parts = berlinFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)!.value);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute"), second: part("second") };
}

/** Ein Berliner Kalendertag dauert beim Wechsel der Sommerzeit 23 oder 25 Stunden. */
export function berlinDayBounds(now = new Date()): { start: string; end: string } {
  const { year, month, day } = berlinParts(now);
  const wallMidnight = Date.UTC(year, month - 1, day);
  const midnightInUtc = (wall: number) => {
    let instant = wall;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const parts = berlinParts(new Date(instant));
      const offset = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant;
      instant = wall - offset;
    }
    return new Date(instant).toISOString().slice(0, 19).replace("T", " ");
  };
  return { start: midnightInUtc(wallMidnight), end: midnightInUtc(wallMidnight + 86_400_000) };
}

function userTotals(teamId: number, userId: number): TotalsRow {
  // Der JOIN prüft die Mitgliedschaft auch dann, wenn die Person noch keine Besuche hat.
  const row = getDb().prepare(`
    SELECT ${TOTALS_SQL}
    FROM users u
    LEFT JOIN visits v ON v.user_id = u.id AND v.team_id = u.team_id
    WHERE u.team_id = ? AND u.id = ?
    GROUP BY u.id
  `).get(teamId, userId) as TotalsRow | undefined;
  if (!row) throw new Error("Die Person gehört nicht zu diesem Team.");
  return row;
}

/** Historische Besuche zählen sofort; Korrekturen und Löschungen korrigieren auch die XP. */
export function getLevelProgress(teamId: number, userId: number): LevelProgress {
  return levelProgress(userTotals(teamId, userId).totalXp);
}

export function getLevelLeaderboard(teamId: number): LevelLeaderboardEntry[] {
  const rows = getDb().prepare(`
    SELECT u.id AS userId, u.name, u.avatar, COALESCE(SUM(${XP_SQL}), 0) AS totalXp
    FROM users u
    LEFT JOIN visits v ON v.user_id = u.id AND v.team_id = u.team_id
    WHERE u.team_id = ? AND u.active = 1
    GROUP BY u.id
    HAVING u.role = 'MEMBER' OR COUNT(v.id) > 0
  `).all(teamId) as Array<{ userId: number; name: string; avatar: string; totalXp: number }>;
  rows.sort((a, b) => b.totalXp - a.totalXp || a.name.localeCompare(b.name, "de") || a.userId - b.userId);
  let rank = 0;
  return rows.map((row, index) => {
    if (index === 0 || row.totalXp !== rows[index - 1].totalXp) rank = index + 1;
    return { userId: row.userId, name: row.name, avatar: row.avatar, rank, progress: levelProgress(row.totalXp) };
  });
}

/** Produktfortschritt und Beständigkeit aus denselben gültigen Besuchen wie die XP. */
function achievementStats(teamId: number, userId: number, totals: LevelTotals): AchievementStats {
  const db = getDb();
  const products = db.prepare(`SELECT
    COALESCE(SUM(outcome = 'SALE' AND energy_type IN ('STROM', 'BEIDES')), 0) AS stromSales,
    COALESCE(SUM(outcome = 'SALE' AND energy_type IN ('GAS', 'BEIDES')), 0) AS gasSales,
    COALESCE(SUM(outcome = 'SALE' AND energy_type = 'BEIDES'), 0) AS dualSales,
    COALESCE(SUM(outcome = 'APPOINTMENT' AND follow_up_done_at IS NOT NULL), 0) AS completedAppointments
    FROM visits WHERE team_id = ? AND user_id = ?`).get(teamId, userId) as
    Pick<AchievementStats, "stromSales" | "gasSales" | "dualSales" | "completedAppointments">;

  // SQLite kennt Europe/Berlin nicht. Stunden zuerst bündeln, dann in JS auf
  // Berliner Tage verteilen: korrekt auch bei Sommerzeit und großen Historien.
  const hours = db.prepare(`SELECT strftime('%Y-%m-%d %H:00:00', created_at) AS hour,
    SUM(outcome = 'SALE') AS sales FROM visits
    WHERE team_id = ? AND user_id = ? GROUP BY hour`).all(teamId, userId) as
    Array<{ hour: string | null; sales: number }>;
  const days = new Map<string, number>();
  for (const row of hours) {
    if (!row.hour) continue;
    const { year, month, day } = berlinParts(new Date(`${row.hour.replace(" ", "T")}Z`));
    const key = `${year}-${month}-${day}`;
    days.set(key, (days.get(key) ?? 0) + row.sales);
  }
  let saleDays = 0;
  let bestDaySales = 0;
  for (const sales of days.values()) {
    if (sales > 0) saleDays += 1;
    bestDaySales = Math.max(bestDaySales, sales);
  }
  return { ...totals, ...products, activeDays: days.size, saleDays, bestDaySales };
}

export function getLevelDashboard(teamId: number, userId: number, now = new Date()): LevelDashboard {
  const db = getDb();
  return db.transaction(() => {
    const { totalXp, ...totals } = userTotals(teamId, userId);
    const { start, end } = berlinDayBounds(now);
    const today = db.prepare(`SELECT ${TOTALS_SQL} FROM visits v
      WHERE v.team_id = ? AND v.user_id = ? AND v.created_at >= ? AND v.created_at < ?`
    ).get(teamId, userId, start, end) as TotalsRow;
    const visits = db.prepare(`SELECT id, outcome, created_at AS createdAt FROM visits
      WHERE team_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20`
    ).all(teamId, userId) as Array<{ id: number; outcome: VisitOutcome; createdAt: string }>;
    return {
      progress: levelProgress(totalXp),
      totals,
      todayXp: today.totalXp,
      goals: dailyGoalsFor(today),
      achievements: achievementsFor(achievementStats(teamId, userId, totals)),
      history: visits.map((visit) => ({ ...visit, label: OUTCOME_LABEL[visit.outcome], xp: xpForOutcome(visit.outcome) })),
      leaderboard: getLevelLeaderboard(teamId),
    };
  })();
}
