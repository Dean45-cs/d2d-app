import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { achievementsFor, achievementTier, sortAchievements, ACHIEVEMENT_TIERS, dailyGoalsFor, levelProgress, LEVEL_TITLES, xpForLevel, xpForOutcome, XP_RULES } from "../../src/lib/levels";
import { berlinDayBounds, getLevelDashboard, getLevelLeaderboard, getLevelProgress } from "../../src/lib/level-queries";
import type { Role, VisitOutcome } from "../../src/lib/types";

const dir = mkdtempSync(path.join(tmpdir(), "d2d-levels-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
const db = getDb();
after(() => { db.close(); global.__d2dDb = undefined; rmSync(dir, { recursive: true, force: true }); });
let serial = 0;

function team() {
  return Number(db.prepare("INSERT INTO teams(name) VALUES (?)").run(`Level test ${++serial}`).lastInsertRowid);
}

function user(teamId: number, name = "Testperson", role: Role = "MEMBER", active = 1) {
  return Number(db.prepare("INSERT INTO users(team_id, name, email, password_hash, role, active) VALUES (?, ?, ?, ?, ?, ?)")
    .run(teamId, name, `levels-${++serial}@test.de`, "unused", role, active).lastInsertRowid);
}

function visit(teamId: number, userId: number, outcome: VisitOutcome, at = "2020-01-01 10:00:00") {
  return Number(db.prepare("INSERT INTO visits(team_id, user_id, outcome, created_at) VALUES (?, ?, ?, ?)")
    .run(teamId, userId, outcome, at).lastInsertRowid);
}

test("XP rewards are exclusive per outcome, with no cumulative sale bonuses", () => {
  assert.deepEqual(XP_RULES.map((rule) => [rule.outcome, rule.xp]), [
    ["NOT_HOME", 5], ["MET_NO_SALE", 15], ["APPOINTMENT", 40], ["SALE", 100],
  ]);
  assert.equal(xpForOutcome("SALE"), 100);
  assert.equal(xpForOutcome("unknown" as VisitOutcome), 0);
  assert.equal(XP_RULES.reduce((sum, rule) => sum + xpForOutcome(rule.outcome), 0), 160);
});

test("level boundaries are exact, increasingly spaced and have no final level", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(xpForLevel), [0, 100, 250, 450, 700]);
  for (const level of [1, 2, 3, 5, 10, 75, 100, 1000, 1_000_000]) {
    const start = xpForLevel(level);
    const next = xpForLevel(level + 1);
    const progress = levelProgress(start);
    assert.equal(progress.level, level);
    assert.equal(progress.xpInLevel, 0);
    assert.equal(progress.percent, 0);
    assert.equal(progress.xpForNextLevel, 100 + (level - 1) * 50);
    assert.equal(progress.xpToNextLevel, next - start);
    assert.equal(levelProgress(next - 1).level, level);
    assert.equal(levelProgress(next).level, level + 1);
  }
});

test("progress stays consistent across many XP values and malformed inputs", () => {
  for (const input of [-100, -0.5, 0, 99.9, 100, 249, 250, 451, 45_678, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, Infinity, -Infinity, NaN]) {
    const result = levelProgress(input);
    for (const value of Object.values(result)) if (typeof value === "number") assert.ok(Number.isFinite(value));
    assert.ok(Number.isSafeInteger(result.totalXp));
    assert.ok(result.level >= 1);
    assert.ok(result.levelStartXp <= result.totalXp);
    assert.ok(result.nextLevelXp > result.totalXp);
    assert.ok(result.percent >= 0 && result.percent < 100);
    assert.equal(result.xpInLevel + result.xpToNextLevel, result.xpForNextLevel);
  }
  for (let xp = 0; xp < 200_000; xp += 137) {
    const result = levelProgress(xp);
    assert.equal(result.levelStartXp + result.xpInLevel, xp);
    assert.equal(result.nextLevelXp - result.xpToNextLevel, xp);
  }
  assert.equal(levelProgress(99.9).totalXp, 99);
  assert.equal(levelProgress(NaN).level, 1);
});

test("titles begin at the specified levels and continue above the last title", () => {
  for (const [index, entry] of LEVEL_TITLES.entries()) {
    assert.equal(levelProgress(xpForLevel(entry.level)).title, entry.title);
    if (index > 0) assert.equal(levelProgress(xpForLevel(entry.level) - 1).title, LEVEL_TITLES[index - 1].title);
  }
  assert.equal(levelProgress(xpForLevel(1000)).title, "Legende");
});

test("achievements use actual totals, precise thresholds, and revoke after correction", () => {
  const none = { doors: 0, met: 0, appointments: 0, sales: 0 };
  const locked = achievementsFor(none);
  assert.equal(locked.length, 50);
  assert.equal(new Set(locked.map((entry) => entry.id)).size, 50);
  assert.ok(locked.every((entry) => !entry.unlocked));
  for (const entry of locked) {
    const before = achievementsFor({ ...none, [entry.kind]: entry.target - 1 }).find((badge) => badge.id === entry.id)!;
    const reached = achievementsFor({ ...none, [entry.kind]: entry.target }).find((badge) => badge.id === entry.id)!;
    assert.equal(before.unlocked, false);
    assert.equal(reached.unlocked, true);
    assert.equal(reached.current, entry.target);
  }
  assert.equal(achievementsFor(none).filter((entry) => entry.unlocked).length, 0);
});

test("daily goals report individual completion and retain counts above the target", () => {
  const goals = dailyGoalsFor({ doors: 21, met: 4, appointments: 0, sales: 1 });
  assert.deepEqual(goals.map(({ id, current, target, completed }) => ({ id, current, target, completed })), [
    { id: "doors", current: 21, target: 20, completed: true },
    { id: "met", current: 4, target: 5, completed: false },
    { id: "sales", current: 1, target: 1, completed: true },
  ]);
});

test("new team members receive a complete empty dashboard at level one", () => {
  const teamId = team();
  const userId = user(teamId);
  const dashboard = getLevelDashboard(teamId, userId);
  assert.equal(dashboard.progress.level, 1);
  assert.equal(dashboard.progress.totalXp, 0);
  assert.deepEqual(dashboard.totals, { doors: 0, met: 0, appointments: 0, sales: 0 });
  assert.equal(dashboard.todayXp, 0);
  assert.equal(dashboard.history.length, 0);
  assert.ok(dashboard.goals.every((goal) => !goal.completed));
  assert.ok(dashboard.achievements.every((badge) => !badge.unlocked));
  assert.equal(dashboard.leaderboard[0].userId, userId);
});

test("historical visits count immediately, and edits and deletion reverse their XP and badges", () => {
  const teamId = team();
  const userId = user(teamId);
  visit(teamId, userId, "NOT_HOME");
  visit(teamId, userId, "MET_NO_SALE");
  visit(teamId, userId, "APPOINTMENT");
  const sale = visit(teamId, userId, "SALE");
  const dashboard = getLevelDashboard(teamId, userId, new Date("2026-09-30T12:00:00Z"));
  assert.deepEqual(dashboard.totals, { doors: 4, met: 3, appointments: 1, sales: 1 });
  assert.equal(dashboard.progress.totalXp, 160);
  assert.equal(dashboard.progress.level, 2);
  assert.equal(dashboard.todayXp, 0);
  assert.equal(dashboard.history.reduce((sum, entry) => sum + entry.xp, 0), 160);
  assert.ok(dashboard.achievements.find((badge) => badge.id === "sales-1")!.unlocked);

  db.prepare("UPDATE visits SET outcome = 'MET_NO_SALE' WHERE id = ?").run(sale);
  assert.equal(getLevelProgress(teamId, userId).totalXp, 75);
  assert.equal(getLevelProgress(teamId, userId).level, 1);
  assert.ok(!getLevelDashboard(teamId, userId).achievements.find((badge) => badge.id === "sales-1")!.unlocked);
  db.prepare("DELETE FROM visits WHERE id = ?").run(sale);
  assert.equal(getLevelProgress(teamId, userId).totalXp, 60);
  assert.equal(getLevelDashboard(teamId, userId).history.length, 3);
});

test("membership is checked even with no visits and all reads remain within the team", () => {
  const teamId = team();
  const otherTeam = team();
  const userId = user(teamId);
  const outsider = user(otherTeam);
  assert.throws(() => getLevelProgress(teamId, outsider), /Team/);
  assert.throws(() => getLevelDashboard(teamId, outsider), /Team/);
  assert.throws(() => getLevelProgress(teamId, -1), /Team/);
  visit(teamId, userId, "NOT_HOME");
  visit(otherTeam, outsider, "SALE");
  // Defensive scope even if an old or malformed row references a user in a different team.
  visit(otherTeam, userId, "SALE");
  const dashboard = getLevelDashboard(teamId, userId);
  assert.equal(dashboard.progress.totalXp, 5);
  assert.equal(dashboard.totals.doors, 1);
  assert.equal(dashboard.history.length, 1);
  assert.deepEqual(dashboard.leaderboard.map((entry) => entry.userId), [userId]);
  assert.equal(dashboard.leaderboard[0].progress.totalXp, 5);
});

test("leaderboard excludes inactive users and idle leaders, includes idle members, and shares tied ranks", () => {
  const teamId = team();
  const anna = user(teamId, "Anna");
  const ben = user(teamId, "Ben");
  const idle = user(teamId, "Neu");
  const leader = user(teamId, "Leitung", "LEADER");
  const idleLeader = user(teamId, "Ohne Besuche", "LEADER");
  const inactive = user(teamId, "Inaktiv", "MEMBER", 0);
  visit(teamId, anna, "SALE");
  visit(teamId, ben, "SALE");
  visit(teamId, leader, "APPOINTMENT");
  visit(teamId, inactive, "SALE");
  visit(teamId, inactive, "SALE");
  const leaderboard = getLevelLeaderboard(teamId);
  assert.deepEqual(leaderboard.map((entry) => entry.userId), [anna, ben, leader, idle]);
  assert.deepEqual(leaderboard.map((entry) => entry.rank), [1, 1, 3, 4]);
  assert.ok(!leaderboard.some((entry) => [idleLeader, inactive].includes(entry.userId)));
  assert.equal(getLevelProgress(teamId, inactive).totalXp, 200);
});

test("leaderboard returns the entire team without dropping users after a display limit", () => {
  const teamId = team();
  for (let index = 0; index < 35; index += 1) user(teamId, `Person ${index}`);
  const leaderboard = getLevelLeaderboard(teamId);
  assert.equal(leaderboard.length, 35);
  assert.ok(leaderboard.every((entry) => entry.rank === 1));
});

test("history returns the latest 20 visits in stable descending order without reducing totals", () => {
  const teamId = team();
  const userId = user(teamId);
  const visits = Array.from({ length: 25 }, () => visit(teamId, userId, "NOT_HOME"));
  const latest = visit(teamId, userId, "SALE", "2026-09-30 12:00:00");
  const dashboard = getLevelDashboard(teamId, userId);
  assert.equal(dashboard.progress.totalXp, 225);
  assert.equal(dashboard.totals.doors, 26);
  assert.equal(dashboard.history.length, 20);
  assert.deepEqual(dashboard.history.map((entry) => entry.id), [latest, ...visits.reverse().slice(0, 19)]);
  assert.equal(dashboard.history[0].label, "Abschluss");
  assert.equal(dashboard.history[0].xp, 100);
});

test("Berlin day boundaries follow local midnight, including summer and winter clock changes", () => {
  const examples = [
    ["2026-09-30T12:00:00Z", "2026-09-29 22:00:00", "2026-09-30 22:00:00"],
    ["2026-01-01T00:00:00Z", "2025-12-31 23:00:00", "2026-01-01 23:00:00"],
    ["2026-03-29T12:00:00Z", "2026-03-28 23:00:00", "2026-03-29 22:00:00"],
    ["2026-10-25T12:00:00Z", "2026-10-24 22:00:00", "2026-10-25 23:00:00"],
    ["2026-09-30T22:30:00Z", "2026-09-30 22:00:00", "2026-10-01 22:00:00"],
  ];
  for (const [now, start, end] of examples) assert.deepEqual(berlinDayBounds(new Date(now)), { start, end });
});

test("today XP and goals include the entire Berlin day and exclude adjacent days and other users", () => {
  const teamId = team();
  const userId = user(teamId);
  const colleague = user(teamId);
  visit(teamId, userId, "SALE", "2026-03-28 22:59:59");
  visit(teamId, userId, "NOT_HOME", "2026-03-28 23:00:00");
  visit(teamId, userId, "SALE", "2026-03-29 21:59:59");
  visit(teamId, userId, "SALE", "2026-03-29 22:00:00");
  visit(teamId, colleague, "SALE", "2026-03-29 12:00:00");
  const dashboard = getLevelDashboard(teamId, userId, new Date("2026-03-29T12:00:00Z"));
  assert.equal(dashboard.progress.totalXp, 305);
  assert.equal(dashboard.todayXp, 105);
  assert.deepEqual(dashboard.goals.map((goal) => goal.current), [2, 1, 1]);
  assert.deepEqual(dashboard.goals.map((goal) => goal.completed), [false, false, true]);
});


test("all achievement tiers sort easy to hard without changing the input or existing badge identities", () => {
  const badges = achievementsFor({ doors: 1000, met: 500, appointments: 50, sales: 100 });
  const originalIds = ["doors-1", "doors-100", "doors-1000", "met-10", "met-100", "met-500", "appointments-1", "appointments-10", "appointments-50", "sales-1", "sales-10", "sales-100"];
  for (const id of originalIds) assert.ok(badges.find((badge) => badge.id === id)?.unlocked, id);
  assert.deepEqual([...new Set(badges.map((badge) => badge.tier))], ACHIEVEMENT_TIERS.map((tier) => tier.id));
  const reversed = [...badges].reverse();
  const copy = [...reversed];
  assert.deepEqual(sortAchievements(reversed), badges);
  assert.deepEqual(reversed, copy);
  for (let index = 1; index < badges.length; index += 1) {
    assert.ok(achievementTier(badges[index].tier).order >= achievementTier(badges[index - 1].tier).order);
  }
  assert.ok(badges.filter((badge) => !["doors", "met", "appointments", "sales"].includes(badge.kind)).every((badge) => badge.current === 0));
});

test("product achievements count only sales; combined energy counts in both tracks but XP and visits once", () => {
  const teamId = team();
  const userId = user(teamId);
  const another = user(teamId);
  const foreignTeam = team();
  const add = (owner: number, outcome: VisitOutcome, product: string, sourceTeam = teamId) => {
    const id = visit(sourceTeam, owner, outcome);
    db.prepare("UPDATE visits SET energy_type = ? WHERE id = ?").run(product, id);
    return id;
  };
  add(userId, "SALE", "STROM");
  add(userId, "SALE", "GAS");
  const combined = add(userId, "SALE", "BEIDES");
  add(userId, "SALE", "");
  add(userId, "MET_NO_SALE", "STROM");
  add(userId, "APPOINTMENT", "GAS");
  add(another, "SALE", "BEIDES");
  add(userId, "SALE", "BEIDES", foreignTeam); // malformed cross-team legacy row
  const dashboard = getLevelDashboard(teamId, userId);
  const value = (kind: string) => dashboard.achievements.find((badge) => badge.kind === kind)!.current;
  assert.equal(value("stromSales"), 2);
  assert.equal(value("gasSales"), 2);
  assert.equal(value("dualSales"), 1);
  assert.equal(dashboard.totals.sales, 4);
  assert.equal(dashboard.progress.totalXp, 455);
  assert.ok(dashboard.achievements.find((badge) => badge.id === "dualSales-1")!.unlocked);
  db.prepare("DELETE FROM visits WHERE id = ?").run(combined);
  const corrected = getLevelDashboard(teamId, userId);
  assert.equal(corrected.achievements.find((badge) => badge.kind === "stromSales")!.current, 1);
  assert.equal(corrected.achievements.find((badge) => badge.kind === "gasSales")!.current, 1);
  assert.equal(corrected.achievements.find((badge) => badge.id === "dualSales-1")!.unlocked, false);
  assert.equal(corrected.progress.totalXp, 355);
});

test("completed appointment badges reflect completion and reopening without granting additional XP", () => {
  const teamId = team();
  const userId = user(teamId);
  const colleague = user(teamId);
  const appointment = visit(teamId, userId, "APPOINTMENT");
  const undone = visit(teamId, userId, "APPOINTMENT");
  const sale = visit(teamId, userId, "SALE");
  const othersAppointment = visit(teamId, colleague, "APPOINTMENT");
  db.prepare("UPDATE visits SET follow_up_done_at = '2026-10-01 10:00:00' WHERE id IN (?, ?, ?)").run(appointment, sale, othersAppointment);
  const getBadge = () => getLevelDashboard(teamId, userId).achievements.find((badge) => badge.id === "completedAppointments-1")!;
  assert.equal(getBadge().current, 1);
  assert.equal(getBadge().unlocked, true);
  assert.equal(getLevelProgress(teamId, userId).totalXp, 180);
  db.prepare("UPDATE visits SET follow_up_done_at = NULL WHERE id = ?").run(appointment);
  assert.equal(getBadge().unlocked, false);
  db.prepare("UPDATE visits SET follow_up_done_at = '2026-10-01 10:00:00' WHERE id = ?").run(undone);
  db.prepare("DELETE FROM visits WHERE id = ?").run(undone);
  assert.equal(getBadge().current, 0);
});

test("activity and personal bests use Berlin calendar days across UTC midnight, DST and breaks", () => {
  const teamId = team();
  const userId = user(teamId);
  const colleague = user(teamId);
  visit(teamId, userId, "SALE", "2026-03-28 23:10:00"); // Mar 29 00:10 Berlin
  visit(teamId, userId, "SALE", "2026-03-29 00:10:00");
  const third = visit(teamId, userId, "SALE", "2026-03-29 21:59:59");
  visit(teamId, userId, "NOT_HOME", "2026-03-29 22:00:00"); // Mar 30
  visit(teamId, userId, "SALE", "2026-04-20 10:00:00"); // pauses allowed
  visit(teamId, userId, "SALE", "2026-10-25 00:15:00"); // repeated 02:15
  visit(teamId, userId, "SALE", "2026-10-25 01:15:00");
  visit(teamId, colleague, "SALE", "2026-03-29 12:00:00");
  const dashboard = getLevelDashboard(teamId, userId);
  const value = (kind: string) => dashboard.achievements.find((badge) => badge.kind === kind)!.current;
  assert.equal(value("activeDays"), 4);
  assert.equal(value("saleDays"), 3);
  assert.equal(value("bestDaySales"), 3);
  assert.equal(dashboard.achievements.find((badge) => badge.id === "bestDaySales-3")!.unlocked, true);
  db.prepare("DELETE FROM visits WHERE id = ?").run(third);
  const corrected = getLevelDashboard(teamId, userId);
  assert.equal(corrected.achievements.find((badge) => badge.kind === "bestDaySales")!.current, 2);
  assert.equal(corrected.achievements.find((badge) => badge.id === "bestDaySales-3")!.unlocked, false);
});
