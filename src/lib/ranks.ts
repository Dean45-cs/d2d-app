import { getDb } from "./db";
import { AuthError } from "./auth";
import { ValidationError } from "./api";
import { assertPermission, structureIds } from "./permissions";
import type { Role, Tier, User } from "./types";
import { DEFAULT_RANKS, TIERS, canLeadTeam, isTier, normalizeRanks, tierIndex, type RankSetup } from "./tiers";
import {
  buildProgress,
  careerSummary,
  fullMonthsBetween,
  goalTargetValid,
  goalUsesPeriod,
  isGoalKind,
  isGoalPeriod,
  isTeamGoal,
  periodStart,
  sqlDate,
  teamGoalsPossible,
  type GoalKind,
  type GoalPeriod,
  type RankGoal,
  type CareerSummary,
  type RankProgress,
} from "./ranks-model";

/*
 * Raenge auf dem Server: Namen und Team-Schalter je Rang, die Ziele fuer
 * den Aufstieg, was eine Person davon schon erreicht hat, Befoerdern samt
 * Verlauf, Feed und Feier.
 *
 * Fortschritt und Verlauf sehen nur die Person selbst, die Fuehrungskraefte
 * ueber ihr und die Geschaeftsfuehrung - alle anderen nur den Rang.
 */

/* -------------------------------- Laden --------------------------------- */

export function loadRanks(teamId: number): RankSetup {
  const rows = getDb()
    .prepare("SELECT tier, label, team FROM rank_settings WHERE team_id = ?")
    .all(teamId) as Array<{ tier: string; label: string; team: number }>;
  const ranks: RankSetup = { ...DEFAULT_RANKS };
  for (const row of rows) {
    if (!isTier(row.tier)) continue;
    ranks[row.tier] = { label: row.label.trim() || DEFAULT_RANKS[row.tier].label, team: Boolean(row.team) };
  }
  return normalizeRanks(ranks);
}

export function loadGoals(teamId: number): RankGoal[] {
  return getDb()
    .prepare("SELECT id, tier, kind, target, period, months FROM rank_goals WHERE team_id = ? ORDER BY id")
    .all(teamId) as RankGoal[];
}

/** Seit wann die Person ihren Rang hat: letzter Wechsel, sonst der Tag, an dem sie in die App kam. */
export function rankSince(userId: number): string {
  const db = getDb();
  const change = db.prepare("SELECT created_at FROM rank_history WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId) as
    | { created_at: string }
    | undefined;
  if (change) return change.created_at;
  const user = db.prepare("SELECT created_at FROM users WHERE id = ?").get(userId) as { created_at: string } | undefined;
  return user?.created_at ?? "1970-01-01 00:00:00";
}

/* -------------------------------- Zaehlen -------------------------------- */

/** Strom + Gas beim selben Kunden zaehlt bei den Abschluessen doppelt. */
const SALE_WEIGHT = "CASE energy_type WHEN 'BEIDES' THEN 2 ELSE 1 END";

function countFor(userIds: number[], kind: "SALES" | "STROM" | "GAS", since: string): number {
  if (userIds.length === 0) return 0;
  const filter = kind === "STROM" ? "AND energy_type IN ('STROM','BEIDES')" : kind === "GAS" ? "AND energy_type IN ('GAS','BEIDES')" : "";
  const value = kind === "SALES" ? `SUM(${SALE_WEIGHT})` : "COUNT(*)";
  const row = getDb()
    .prepare(
      `SELECT COALESCE(${value}, 0) AS n FROM visits
        WHERE user_id IN (${userIds.map(() => "?").join(",")}) AND outcome = 'SALE' AND created_at >= ? ${filter}`,
    )
    .get(...userIds, since) as { n: number };
  return row.n;
}

/** Aktive Leute direkt unter der Person - die zaehlen fuer die Team-Ziele. */
function directReports(teamId: number, userId: number): number[] {
  return (getDb()
    .prepare("SELECT id FROM users WHERE manager_id = ? AND team_id = ? AND active = 1 AND role = 'MEMBER' AND id <> ?")
    .all(userId, teamId, userId) as Array<{ id: number }>).map((row) => row.id);
}

export function goalValue(goal: RankGoal, ctx: { teamId: number; userId: number; since: string; now: Date }): number {
  if (goal.kind === "MONTHS") return fullMonthsBetween(sqlDate(ctx.since), ctx.now);
  const start = goalUsesPeriod(goal.kind) ? periodStart(goal, ctx.since, ctx.now) : ctx.since;
  if (!isTeamGoal(goal.kind)) return countFor([ctx.userId], goal.kind as "SALES" | "STROM" | "GAS", start);
  const team = directReports(ctx.teamId, ctx.userId);
  if (goal.kind === "TEAM_SIZE") return team.length;
  const total = countFor(team, "SALES", start);
  if (goal.kind === "TEAM_SUM") return total;
  return team.length === 0 ? 0 : Math.round((total / team.length) * 10) / 10;
}

interface RankSubject {
  id: number;
  team_id: number;
  role: Role;
  tier: Tier;
}

/** Wie weit die Person zum naechsten Rang ist. Die Geschaeftsfuehrung hat keinen. */
export function rankProgress(subject: RankSubject, goals = loadGoals(subject.team_id), now = new Date()): RankProgress | null {
  if (subject.role === "LEADER") return null;
  const since = rankSince(subject.id);
  return buildProgress(subject.tier, since, goals, (goal) => goalValue(goal, { teamId: subject.team_id, userId: subject.id, since, now }));
}

/** Person selbst, jede Fuehrungskraft ueber ihr und die Geschaeftsfuehrung. */
export function canSeeProgress(viewer: User, subjectId: number): boolean {
  if (!viewer.active) return false;
  if (viewer.id === subjectId) return true;
  const subject = getDb().prepare("SELECT id FROM users WHERE id = ? AND team_id = ?").get(subjectId, viewer.team_id);
  if (!subject) return false;
  return viewer.role === "LEADER" || structureIds(viewer).includes(subjectId);
}

/* ------------------------------ Einstellen ------------------------------- */

function assertRankAdmin(actor: User): void {
  assertPermission(actor, "team.roles");
  if (actor.role !== "LEADER") throw new AuthError("Nur die Geschäftsführung stellt die Ränge ein.", 403);
}

/** Wer in einem Rang ohne Team noch Leute unter sich hat - dann darf der Schalter nicht aus. */
function leadersWithTeam(teamId: number, tiers: Tier[]): Array<{ name: string; count: number }> {
  if (tiers.length === 0) return [];
  return getDb()
    .prepare(
      `SELECT u.name, COUNT(r.id) AS count FROM users u
         JOIN users r ON r.manager_id = u.id AND r.id <> u.id
        WHERE u.team_id = ? AND u.role = 'MEMBER' AND u.tier IN (${tiers.map(() => "?").join(",")})
        GROUP BY u.id ORDER BY u.name COLLATE NOCASE`,
    )
    .all(teamId, ...tiers) as Array<{ name: string; count: number }>;
}

/** Name und Team-Schalter eines Rangs. Ein Team ist nach oben offen (normalizeRanks). */
export function saveRank(actor: User, tier: unknown, patch: { label?: unknown; team?: unknown }): RankSetup {
  assertRankAdmin(actor);
  if (!isTier(tier)) throw new ValidationError("Unbekannter Rang.");
  const current = loadRanks(actor.team_id);
  const next: RankSetup = { ...current, [tier]: { ...current[tier] } };
  if (patch.label !== undefined) {
    const label = String(patch.label ?? "").trim().replace(/\s+/g, " ");
    if (!label) throw new ValidationError("Der Rang braucht einen Namen.");
    if (label.length > 40) throw new ValidationError("Der Name ist zu lang (höchstens 40 Zeichen).");
    const clash = TIERS.find((other) => other !== tier && current[other].label.toLocaleLowerCase("de-DE") === label.toLocaleLowerCase("de-DE"));
    if (clash) throw new ValidationError(`„${label}“ heißt schon ein anderer Rang.`);
    next[tier].label = label;
  }
  if (patch.team !== undefined) {
    const on = Boolean(patch.team);
    // Aus heisst: auch alle Raenge darunter ohne Team. An heisst: alle darueber mit Team.
    for (const other of TIERS) {
      if (on && tierIndex(other) >= tierIndex(tier)) next[other] = { ...next[other], team: true };
      if (!on && tierIndex(other) <= tierIndex(tier)) next[other] = { ...next[other], team: false };
    }
    const lost = TIERS.filter((other) => current[other].team && !next[other].team);
    const blocking = leadersWithTeam(actor.team_id, lost);
    if (blocking.length > 0) {
      const first = blocking[0];
      throw new ValidationError(
        `${first.name} hat noch ${first.count === 1 ? "eine Person" : `${first.count} Personen`} unter sich${
          blocking.length > 1 ? ` (und ${blocking.length - 1} weitere)` : ""
        }. Ordne die Leute zuerst jemand anderem zu.`,
      );
    }
    // Team-Ziele, die nun niemand mehr erreichen kann, fallen weg.
    const db = getDb();
    for (const other of TIERS) {
      if (!teamGoalsPossible(other, next)) {
        db.prepare("DELETE FROM rank_goals WHERE team_id = ? AND tier = ? AND kind IN ('TEAM_SIZE','TEAM_SUM','TEAM_AVG')").run(actor.team_id, other);
      }
    }
  }
  const save = getDb().prepare(
    `INSERT INTO rank_settings (team_id, tier, label, team, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(team_id, tier) DO UPDATE SET label = excluded.label, team = excluded.team,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  );
  getDb().transaction(() => {
    for (const other of TIERS) save.run(actor.team_id, other, next[other].label, next[other].team ? 1 : 0, actor.id);
  })();
  return loadRanks(actor.team_id);
}

export interface GoalInput {
  kind?: unknown;
  target?: unknown;
  period?: unknown;
  months?: unknown;
}

function checkedGoal(teamId: number, tier: Tier, input: GoalInput): Omit<RankGoal, "id"> {
  if (tier === "BERATER") throw new ValidationError("Berater ist der Einstieg – dafür gibt es keine Ziele.");
  if (!isGoalKind(input.kind)) throw new ValidationError("Unbekannte Zielart.");
  const kind: GoalKind = input.kind;
  const target = Number(String(input.target ?? "").replace(",", "."));
  if (!goalTargetValid(kind, target)) {
    throw new ValidationError(kind === "TEAM_AVG" ? "Bitte einen Wert über 0 mit höchstens einer Nachkommastelle." : "Bitte eine ganze Zahl über 0.");
  }
  if (isTeamGoal(kind) && !teamGoalsPossible(tier, loadRanks(teamId))) {
    throw new ValidationError("Team-Ziele gehen erst, wenn der Rang darunter ein Team haben darf.");
  }
  let period: GoalPeriod = "SINCE_RANK";
  let months: number | null = null;
  if (goalUsesPeriod(kind)) {
    if (!isGoalPeriod(input.period)) throw new ValidationError("Bitte einen Zeitraum wählen.");
    period = input.period;
    if (period === "LAST_MONTHS") {
      months = Number(input.months);
      if (!Number.isInteger(months) || months < 1 || months > 36) throw new ValidationError("Bitte 1 bis 36 Monate.");
    }
  }
  return { tier, kind, target, period, months };
}

export function createGoal(actor: User, tier: unknown, input: GoalInput): number {
  assertRankAdmin(actor);
  if (!isTier(tier)) throw new ValidationError("Unbekannter Rang.");
  const goal = checkedGoal(actor.team_id, tier, input);
  const { count } = getDb().prepare("SELECT COUNT(*) AS count FROM rank_goals WHERE team_id = ? AND tier = ?").get(actor.team_id, tier) as { count: number };
  if (count >= 8) throw new ValidationError("Höchstens 8 Ziele je Rang.");
  return getDb()
    .prepare("INSERT INTO rank_goals (team_id, tier, kind, target, period, months) VALUES (?, ?, ?, ?, ?, ?)")
    .run(actor.team_id, goal.tier, goal.kind, goal.target, goal.period, goal.months).lastInsertRowid as number;
}

export function updateGoal(actor: User, id: number, input: GoalInput): void {
  assertRankAdmin(actor);
  const row = getDb().prepare("SELECT tier FROM rank_goals WHERE id = ? AND team_id = ?").get(id, actor.team_id) as { tier: Tier } | undefined;
  if (!row) throw new Error("Ziel nicht gefunden.");
  const goal = checkedGoal(actor.team_id, row.tier, input);
  getDb()
    .prepare("UPDATE rank_goals SET kind = ?, target = ?, period = ?, months = ? WHERE id = ?")
    .run(goal.kind, goal.target, goal.period, goal.months, id);
}

export function deleteGoal(actor: User, id: number): void {
  assertRankAdmin(actor);
  const result = getDb().prepare("DELETE FROM rank_goals WHERE id = ? AND team_id = ?").run(id, actor.team_id);
  if (result.changes === 0) throw new Error("Ziel nicht gefunden.");
}

/* ------------------------------- Befoerdern ------------------------------ */

export interface RankChange {
  tier: Tier;
  from: Tier;
  /** Leute, die beim Herabstufen zur Fuehrungskraft darueber gerutscht sind. */
  moved: number;
  postId: number | null;
}

/**
 * Rang setzen. Hoeher: Feier beim naechsten Oeffnen und auf Wunsch ein
 * Beitrag im Feed. Niedriger auf einen Rang ohne Team: die Leute der Person
 * rutschen zu ihrer Fuehrungskraft. Jeder Wechsel kommt in den Verlauf.
 */
export function changeRank(
  actor: User,
  userId: number,
  value: unknown,
  options: { share?: unknown; message?: unknown } = {},
): RankChange {
  assertRankAdmin(actor);
  if (!isTier(value)) throw new ValidationError("Unbekannter Rang.");
  const db = getDb();
  const member = db.prepare("SELECT * FROM users WHERE id = ? AND team_id = ?").get(userId, actor.team_id) as User | undefined;
  if (!member) throw new Error("Mitglied nicht gefunden.");
  if (member.role === "LEADER") throw new ValidationError("Die Geschäftsführung hat keinen Rang im Vertrieb.");
  const from = member.tier;
  if (from === value) return { tier: value, from, moved: 0, postId: null };
  const ranks = loadRanks(actor.team_id);
  const up = tierIndex(value) > tierIndex(from);
  const message = String(options.message ?? "").trim().slice(0, 300);
  let moved = 0;
  let postId: number | null = null;

  db.transaction(() => {
    if (!canLeadTeam({ role: "MEMBER", tier: value }, ranks)) {
      // Wer kein Team mehr haben darf, gibt seine Leute nach oben ab.
      if (member.manager_id === null) {
        const { count } = db.prepare("SELECT COUNT(*) AS count FROM users WHERE manager_id = ? AND id <> ?").get(userId, userId) as { count: number };
        if (count > 0) throw new ValidationError(`${member.name} hat keine Führungskraft – ordne die Leute zuerst jemand anderem zu.`);
      } else {
        moved = db.prepare("UPDATE users SET manager_id = ? WHERE manager_id = ? AND id <> ?").run(member.manager_id, userId, userId).changes;
      }
    }
    db.prepare("UPDATE users SET tier = ?, rank_celebrate = ?, rank_ready_tier = NULL WHERE id = ?").run(value, up ? value : null, userId);
    db.prepare("INSERT INTO rank_history (team_id, user_id, from_tier, tier, changed_by) VALUES (?, ?, ?, ?, ?)").run(
      actor.team_id,
      userId,
      from,
      value,
      actor.id,
    );
    if (up && options.share) {
      postId = db
        .prepare("INSERT INTO posts (team_id, user_id, kind, body, rank_tier, rank_by) VALUES (?, ?, 'RANK', ?, ?, ?)")
        .run(actor.team_id, userId, message, value, actor.id).lastInsertRowid as number;
    }
  })();
  return { tier: value, from, moved, postId };
}

export interface RankHistoryEntry {
  tier: Tier;
  from: Tier | null;
  at: string;
}

/** Der Verlauf von alt nach neu - vorne der Einstieg mit dem Tag, an dem die Person in die App kam. */
export function rankHistory(userId: number): RankHistoryEntry[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT from_tier, tier, created_at FROM rank_history WHERE user_id = ? ORDER BY id")
    .all(userId) as Array<{ from_tier: string | null; tier: string; created_at: string }>;
  const user = db.prepare("SELECT tier, created_at FROM users WHERE id = ?").get(userId) as { tier: Tier; created_at: string } | undefined;
  if (!user) return [];
  const first = rows[0]?.from_tier;
  const start: RankHistoryEntry = { tier: isTier(first) ? first : rows.length === 0 ? user.tier : "BERATER", from: null, at: user.created_at };
  return [
    start,
    ...rows.filter((row) => isTier(row.tier)).map((row) => ({ tier: row.tier as Tier, from: isTier(row.from_tier) ? row.from_tier : null, at: row.created_at })),
  ];
}

/* -------------------------------- Feier ---------------------------------- */

/** Der Rang, den die Person feiern darf - einmal nach der Befoerderung. */
export function pendingCelebration(user: Pick<User, "id" | "tier" | "role">): Tier | null {
  if (user.role === "LEADER") return null;
  const row = getDb().prepare("SELECT rank_celebrate FROM users WHERE id = ?").get(user.id) as { rank_celebrate: string | null } | undefined;
  const tier = row?.rank_celebrate;
  return isTier(tier) && tier === user.tier ? tier : null;
}

export function acknowledgeCelebration(userId: number): void {
  getDb().prepare("UPDATE users SET rank_celebrate = NULL WHERE id = ?").run(userId);
}

/* ---------------------------- Bereit melden ------------------------------ */

/**
 * Wer neu alle Ziele erreicht hat - die Person selbst und (wegen der
 * Team-Ziele) ihre Fuehrungskraft. Gemeldet wird je Rang nur einmal.
 * Gibt zurueck, wer an wen gemeldet werden soll.
 */
export function newlyReady(teamId: number, userId: number): Array<{ userId: number; name: string; tier: Tier; recipients: number[] }> {
  const db = getDb();
  const goals = loadGoals(teamId);
  if (goals.length === 0) return [];
  const person = db.prepare("SELECT id, team_id, role, tier, manager_id, active FROM users WHERE id = ? AND team_id = ?").get(userId, teamId) as
    | (RankSubject & { manager_id: number | null; active: number })
    | undefined;
  if (!person) return [];
  const candidates = [person];
  if (person.manager_id !== null) {
    const manager = db.prepare("SELECT id, team_id, role, tier, manager_id, active FROM users WHERE id = ? AND team_id = ?").get(person.manager_id, teamId) as
      | (RankSubject & { manager_id: number | null; active: number })
      | undefined;
    if (manager) candidates.push(manager);
  }
  const out: Array<{ userId: number; name: string; tier: Tier; recipients: number[] }> = [];
  for (const candidate of candidates) {
    if (!candidate.active || candidate.role === "LEADER") continue;
    const progress = rankProgress(candidate, goals);
    if (!progress?.ready || !progress.next) continue;
    const row = db.prepare("SELECT name, rank_ready_tier FROM users WHERE id = ?").get(candidate.id) as { name: string; rank_ready_tier: string | null };
    if (row.rank_ready_tier === progress.next) continue;
    db.prepare("UPDATE users SET rank_ready_tier = ? WHERE id = ?").run(progress.next, candidate.id);
    out.push({ userId: candidate.id, name: row.name, tier: progress.next, recipients: readyRecipients(teamId, candidate.manager_id) });
  }
  return out;
}

/** Der direkte Chef - ohne einen die Geschaeftsfuehrung, die Raenge vergibt. */
function readyRecipients(teamId: number, managerId: number | null): number[] {
  const db = getDb();
  if (managerId !== null) {
    const manager = db.prepare("SELECT id FROM users WHERE id = ? AND team_id = ? AND active = 1").get(managerId, teamId) as { id: number } | undefined;
    if (manager) return [manager.id];
  }
  return (db.prepare("SELECT id FROM users WHERE team_id = ? AND role = 'LEADER' AND active = 1").all(teamId) as Array<{ id: number }>).map((row) => row.id);
}

/** Alle im Team, die gerade bereit fuer den naechsten Rang sind - fuer die Leiter. */
export function readyIds(teamId: number, goals = loadGoals(teamId)): Set<number> {
  const ready = new Set<number>();
  if (goals.length === 0) return ready;
  const members = getDb()
    .prepare("SELECT id, team_id, role, tier FROM users WHERE team_id = ? AND active = 1 AND role = 'MEMBER'")
    .all(teamId) as RankSubject[];
  const now = new Date();
  for (const member of members) if (rankProgress(member, goals, now)?.ready) ready.add(member.id);
  return ready;
}

/** Rang und Fortschritt fertig beschriftet - fuer Karte und Leiter. Nur wer ihn sehen darf. */
export function careerFor(viewer: User, subject: RankSubject, ranks = loadRanks(subject.team_id)): CareerSummary | null {
  if (!canSeeProgress(viewer, subject.id)) return null;
  const progress = rankProgress(subject);
  return progress ? careerSummary(progress, ranks) : null;
}
