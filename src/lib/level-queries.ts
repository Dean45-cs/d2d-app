import { getDb } from "./db";
import { achievementsFor, dailyGoalsFor, type Achievement, type AchievementStats, type DailyGoal, type LevelTotals } from "./levels";
import { berlinDayBounds, berlinParts } from "./format";

/*
 * Erfolge aus der Datenbank: Abzeichen und Tagesziele. XP und Level gibt es
 * nicht mehr - den Aufstieg zeigt die Karriereleiter.
 */

const TOTALS_SQL = `COUNT(v.id) AS doors,
  COALESCE(SUM(v.outcome IN ('MET_NO_SALE', 'APPOINTMENT', 'SALE')), 0) AS met,
  COALESCE(SUM(v.outcome = 'APPOINTMENT'), 0) AS appointments,
  COALESCE(SUM(v.outcome = 'SALE'), 0) AS sales`;

export interface LevelDashboard {
  totals: LevelTotals;
  goals: DailyGoal[];
  achievements: Achievement[];
}

// Berliner Tagesgrenzen stehen in format.ts - die Rangliste rechnet mit denselben.
export { berlinDayBounds };

function userTotals(teamId: number, userId: number): LevelTotals {
  // Der JOIN prüft die Mitgliedschaft auch dann, wenn die Person noch keine Besuche hat.
  const row = getDb().prepare(`
    SELECT ${TOTALS_SQL}
    FROM users u
    LEFT JOIN visits v ON v.user_id = u.id AND v.team_id = u.team_id
    WHERE u.team_id = ? AND u.id = ?
    GROUP BY u.id
  `).get(teamId, userId) as LevelTotals | undefined;
  if (!row) throw new Error("Die Person gehört nicht zu diesem Team.");
  return row;
}

/** Produktfortschritt und Beständigkeit aus denselben gültigen Besuchen wie die Zahlen. */
function achievementStats(teamId: number, userId: number, totals: LevelTotals): AchievementStats {
  const db = getDb();
  const products = db.prepare(`SELECT
    COALESCE(SUM(outcome = 'SALE' AND energy_type IN ('STROM', 'BEIDES')), 0) AS stromSales,
    COALESCE(SUM(outcome = 'SALE' AND energy_type IN ('GAS', 'BEIDES')), 0) AS gasSales,
    COALESCE(SUM(outcome = 'SALE' AND energy_type = 'BEIDES'), 0) AS dualSales
    FROM visits WHERE team_id = ? AND user_id = ?`).get(teamId, userId) as
    Pick<AchievementStats, "stromSales" | "gasSales" | "dualSales">;
  // Erledigte Termine zaehlen fuer den, dem der Termin gehoert (auch nach einer
  // Gebietsuebergabe) - der hakt ihn ab, nicht wer ihn einst vereinbart hat.
  const { completedAppointments } = db.prepare(`SELECT COUNT(*) AS completedAppointments FROM visits
    WHERE +team_id = ? AND outcome = 'APPOINTMENT' AND follow_up_done_at IS NOT NULL
      AND COALESCE(follow_up_user_id, user_id) = ?`).get(teamId, userId) as Pick<AchievementStats, "completedAppointments">;

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
  return { ...totals, ...products, completedAppointments, activeDays: days.size, saleDays, bestDaySales };
}

export function getLevelDashboard(teamId: number, userId: number, now = new Date()): LevelDashboard {
  const db = getDb();
  return db.transaction(() => {
    const totals = userTotals(teamId, userId);
    const { start, end } = berlinDayBounds(now);
    const today = db.prepare(`SELECT ${TOTALS_SQL} FROM visits v
      WHERE v.team_id = ? AND v.user_id = ? AND v.created_at >= ? AND v.created_at < ?`
    ).get(teamId, userId, start, end) as LevelTotals;
    return {
      totals,
      goals: dailyGoalsFor(today),
      achievements: achievementsFor(achievementStats(teamId, userId, totals)),
    };
  })();
}
