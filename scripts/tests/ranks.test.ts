import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { AuthError } from "../../src/lib/auth";
import { ValidationError } from "../../src/lib/api";
import {
  acknowledgeCelebration,
  canSeeProgress,
  changeRank,
  createGoal,
  deleteGoal,
  loadGoals,
  loadRanks,
  newlyReady,
  pendingCelebration,
  rankHistory,
  rankProgress,
  readyIds,
  saveRank,
  updateGoal,
} from "../../src/lib/ranks";
import { fullMonthsBetween, goalSummary, goalTitle, periodStart, progressSummary, sqlDate } from "../../src/lib/ranks-model";
import type { User } from "../../src/lib/types";

/* Raenge: Einstellungen, Ziele, Fortschritt, Befoerdern, Feier und Bereit-Meldung - gegen eine echte Datenbank. */

const dir = mkdtempSync(path.join(tmpdir(), "d2d-ranks-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
const db = getDb();
after(() => {
  db.close();
  global.__d2dDb = undefined;
  rmSync(dir, { recursive: true, force: true });
});

let sequence = 0;
const user = (id: number) => db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
const invalid = (fn: () => unknown, pattern?: RegExp) =>
  assert.throws(fn, (error: unknown) => error instanceof ValidationError && (!pattern || pattern.test(error.message)));

/** Geschaeftsfuehrung -> Tom (Teamleiter) -> Jana (Junior Teamleiter) -> Ben, Sven (Berater); Paul (Senior) direkt darunter. */
function fixture() {
  const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Raenge')").run().lastInsertRowid);
  const add = (name: string, manager: number | null, tier = "BERATER", role = "MEMBER", created = "2026-01-10 09:00:00") =>
    Number(
      db
        .prepare("INSERT INTO users(team_id, manager_id, name, email, password_hash, role, tier, created_at) VALUES (?, ?, ?, ?, '', ?, ?, ?)")
        .run(team, manager, name, `${name}-${++sequence}@example.test`, role, tier, created).lastInsertRowid,
    );
  const leader = add("Chefin", null, "BERATER", "LEADER");
  const tom = add("Tom", leader, "TEAMLEITER");
  const jana = add("Jana", tom, "JUNIOR_LEAD");
  const ben = add("Ben", jana);
  const sven = add("Sven", jana);
  const paul = add("Paul", leader, "SENIOR");
  return { team, leader, tom, jana, ben, sven, paul };
}

function sale(userId: number, teamId: number, energy: string, at: string) {
  db.prepare("INSERT INTO visits (team_id, user_id, outcome, energy_type, created_at) VALUES (?, ?, 'SALE', ?, ?)").run(teamId, userId, energy, at);
}

test("Zeitraeume beginnen in Berliner Zeit - Monat, Quartal, letzte Monate, seit Aufstieg", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  assert.equal(periodStart({ period: "MONTH", months: null }, "x", now), "2026-10-31 23:00:00");
  assert.equal(periodStart({ period: "QUARTER", months: null }, "x", now), "2026-09-30 22:00:00");
  assert.equal(periodStart({ period: "LAST_MONTHS", months: 3 }, "x", now), "2026-08-24 22:00:00");
  assert.equal(periodStart({ period: "SINCE_RANK", months: null }, "2026-05-01 10:00:00", now), "2026-05-01 10:00:00");
  // Vom 31.05. einen Monat zurueck ist der 30.04. - kein Ueberlauf in den Mai.
  assert.equal(periodStart({ period: "LAST_MONTHS", months: 1 }, "x", new Date("2026-05-31T12:00:00Z")), "2026-04-29 22:00:00");
  assert.equal(fullMonthsBetween(sqlDate("2026-08-25 10:00:00"), now), 3);
  assert.equal(fullMonthsBetween(sqlDate("2026-08-26 10:00:00"), now), 2);
  assert.equal(fullMonthsBetween(sqlDate("2027-01-01 00:00:00"), now), 0);
  assert.equal(goalTitle({ kind: "SALES", target: 50 }), "50 Abschlüsse");
  assert.equal(goalTitle({ kind: "TEAM_AVG", target: 6.5 }), "Ø 6,5 Abschlüsse je Person im Team");
  assert.equal(goalSummary({ id: 1, tier: "SENIOR", kind: "GAS", target: 10, period: "LAST_MONTHS", months: 3 }), "10 Gas-Abschlüsse · letzte 3 Monate");
  assert.equal(goalSummary({ id: 1, tier: "SENIOR", kind: "MONTHS", target: 3, period: "SINCE_RANK", months: null }), "3 Monate im Rang");
});

test("Raenge einstellen: Namen, Team-Schalter nach oben offen, nur die Geschaeftsfuehrung", () => {
  const f = fixture();
  const leader = user(f.leader);
  assert.throws(() => saveRank(user(f.tom), "SENIOR", { label: "Profi" }), (error: unknown) => error instanceof AuthError);
  invalid(() => saveRank(leader, "CHEF", { label: "x" }), /Unbekannter Rang/);
  invalid(() => saveRank(leader, "SENIOR", { label: "  " }), /Namen/);
  invalid(() => saveRank(leader, "SENIOR", { label: "teamleiter" }), /schon ein anderer Rang/);
  let ranks = saveRank(leader, "SENIOR", { label: "  Senior   Profi " });
  assert.equal(ranks.SENIOR.label, "Senior Profi");
  // Darf der Senior ein Team haben, duerfen es alle darueber auch.
  ranks = saveRank(leader, "SENIOR", { team: true });
  assert.deepEqual([ranks.BERATER.team, ranks.SENIOR.team, ranks.JUNIOR_LEAD.team, ranks.TEAMLEITER.team], [false, true, true, true]);
  // Aus geht nicht, solange jemand in einem betroffenen Rang Leute hat: Jana hat zwei.
  invalid(() => saveRank(leader, "JUNIOR_LEAD", { team: false }), /Jana hat noch 2 Personen/);
  ranks = saveRank(leader, "SENIOR", { team: false });
  assert.deepEqual([ranks.SENIOR.team, ranks.JUNIOR_LEAD.team], [false, true]);
  assert.deepEqual(loadRanks(f.team), ranks);
});

test("Ziele: geprueft, je Rang, Team-Ziele nur wo erreichbar", () => {
  const f = fixture();
  const leader = user(f.leader);
  invalid(() => createGoal(leader, "BERATER", { kind: "SALES", target: 5, period: "SINCE_RANK" }), /Einstieg/);
  invalid(() => createGoal(leader, "SENIOR", { kind: "SALES", target: 0, period: "SINCE_RANK" }), /ganze Zahl/);
  invalid(() => createGoal(leader, "SENIOR", { kind: "SALES", target: 2.5, period: "SINCE_RANK" }), /ganze Zahl/);
  invalid(() => createGoal(leader, "SENIOR", { kind: "SALES", target: 5, period: "IRGENDWANN" }), /Zeitraum/);
  invalid(() => createGoal(leader, "SENIOR", { kind: "SALES", target: 5, period: "LAST_MONTHS", months: 0 }), /Monate/);
  // Senior Berater hat kein Team - Team-Ziele fuer den Junior Teamleiter waeren unerreichbar.
  invalid(() => createGoal(leader, "JUNIOR_LEAD", { kind: "TEAM_SIZE", target: 2 }), /Team-Ziele/);
  const avg = createGoal(leader, "TEAMLEITER", { kind: "TEAM_AVG", target: "1,5", period: "MONTH" });
  assert.deepEqual(loadGoals(f.team).map((goal) => [goal.tier, goal.kind, goal.target, goal.period]), [["TEAMLEITER", "TEAM_AVG", 1.5, "MONTH"]]);
  updateGoal(leader, avg, { kind: "TEAM_SUM", target: 4, period: "QUARTER" });
  assert.deepEqual(loadGoals(f.team).map((goal) => [goal.kind, goal.target, goal.period]), [["TEAM_SUM", 4, "QUARTER"]]);
  // Zeit im Rang braucht keinen Zeitraum.
  createGoal(leader, "SENIOR", { kind: "MONTHS", target: 3 });
  assert.equal(loadGoals(f.team).find((goal) => goal.kind === "MONTHS")!.period, "SINCE_RANK");
  // Schaltet der Junior Teamleiter sein Team ab (geht erst ohne Leute), fallen Team-Ziele des Teamleiters weg.
  db.prepare("UPDATE users SET manager_id = ? WHERE manager_id = ?").run(f.tom, f.jana);
  saveRank(leader, "JUNIOR_LEAD", { team: false });
  assert.deepEqual(loadGoals(f.team).map((goal) => goal.kind), ["MONTHS"]);
  deleteGoal(leader, loadGoals(f.team)[0].id);
  assert.equal(loadGoals(f.team).length, 0);
});

test("Fortschritt: Kombi zaehlt doppelt, Strom und Gas je einmal, Team-Ziele mit den direkten Leuten", () => {
  const f = fixture();
  const leader = user(f.leader);
  const now = new Date("2026-11-25T12:00:00Z");
  sale(f.ben, f.team, "BEIDES", "2026-11-03 10:00:00");
  sale(f.ben, f.team, "STROM", "2026-11-04 10:00:00");
  sale(f.ben, f.team, "GAS", "2026-09-04 10:00:00");
  sale(f.sven, f.team, "STROM", "2026-11-05 10:00:00");
  // Vor dem Aufstieg: zaehlt "seit letztem Aufstieg" nicht.
  sale(f.ben, f.team, "STROM", "2025-12-01 10:00:00");
  createGoal(leader, "SENIOR", { kind: "SALES", target: 5, period: "SINCE_RANK" });
  createGoal(leader, "SENIOR", { kind: "STROM", target: 2, period: "MONTH" });
  createGoal(leader, "SENIOR", { kind: "GAS", target: 2, period: "LAST_MONTHS", months: 3 });
  createGoal(leader, "SENIOR", { kind: "MONTHS", target: 10 });
  const ben = rankProgress(user(f.ben), undefined, now)!;
  assert.equal(ben.next, "SENIOR");
  // Ben ist seit 10.01.2026 dabei: 2 (Kombi) + 1 + 1 = 4 Abschluesse, Strom im November 2, Gas 2, 10 volle Monate.
  assert.deepEqual(ben.goals.map((entry) => [entry.goal.kind, entry.value, entry.met]), [
    ["SALES", 4, false],
    ["STROM", 2, true],
    ["GAS", 2, true],
    ["MONTHS", 10, true],
  ]);
  assert.equal(ben.ready, false);
  assert.equal(progressSummary(ben), "3 von 4 Zielen");
  sale(f.ben, f.team, "STROM", "2026-11-06 10:00:00");
  assert.equal(rankProgress(user(f.ben), undefined, now)!.ready, true);

  // Team-Ziele fuer den Teamleiter zaehlen Janas direkte Leute: Ben 5 (Kombi doppelt), Sven 1.
  createGoal(leader, "TEAMLEITER", { kind: "TEAM_SIZE", target: 2 });
  createGoal(leader, "TEAMLEITER", { kind: "TEAM_SUM", target: 5, period: "QUARTER" });
  createGoal(leader, "TEAMLEITER", { kind: "TEAM_AVG", target: 3.5, period: "SINCE_RANK" });
  const jana = rankProgress(user(f.jana), undefined, now)!;
  assert.deepEqual(jana.goals.map((entry) => [entry.goal.kind, entry.value, entry.met]), [
    ["TEAM_SIZE", 2, true],
    ["TEAM_SUM", 5, true],
    ["TEAM_AVG", 3, false],
  ]);
  // Ganz oben gibt es keinen naechsten Rang, die Geschaeftsfuehrung hat keinen.
  assert.deepEqual([rankProgress(user(f.tom))!.next, rankProgress(user(f.tom))!.goals], [null, []]);
  assert.equal(rankProgress(leader), null);
});

test("Fortschritt sehen: die Person, ihre Fuehrungskraefte und die Geschaeftsfuehrung", () => {
  const f = fixture();
  assert.ok(canSeeProgress(user(f.ben), f.ben));
  assert.ok(canSeeProgress(user(f.jana), f.ben));
  assert.ok(canSeeProgress(user(f.tom), f.ben), "auch zwei Ebenen darueber");
  assert.ok(canSeeProgress(user(f.leader), f.ben));
  assert.ok(!canSeeProgress(user(f.sven), f.ben), "Kollegen sehen nur den Rang");
  assert.ok(!canSeeProgress(user(f.paul), f.ben));
  assert.ok(!canSeeProgress(user(f.ben), f.jana), "nach oben nicht");
});

test("Befoerdern: Verlauf, Feier einmal, Feed auf Wunsch, Herabstufen gibt die Leute nach oben ab", () => {
  const f = fixture();
  const leader = user(f.leader);
  const up = changeRank(leader, f.ben, "SENIOR", { share: true, message: "Glückwunsch, Ben!" });
  assert.ok(up.postId);
  const post = db.prepare("SELECT user_id, kind, body, rank_tier, rank_by FROM posts WHERE id = ?").get(up.postId) as Record<string, unknown>;
  assert.deepEqual(post, { user_id: f.ben, kind: "RANK", body: "Glückwunsch, Ben!", rank_tier: "SENIOR", rank_by: f.leader });
  assert.equal(pendingCelebration(user(f.ben)), "SENIOR");
  acknowledgeCelebration(f.ben);
  assert.equal(pendingCelebration(user(f.ben)), null);
  // Ohne Feed: kein Beitrag. Abwaerts: keine Feier.
  assert.equal(changeRank(leader, f.ben, "JUNIOR_LEAD").postId, null);
  changeRank(leader, f.ben, "BERATER", { share: true });
  assert.equal(pendingCelebration(user(f.ben)), null);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM posts WHERE user_id = ?").get(f.ben) as { n: number }).n, 1);
  assert.deepEqual(rankHistory(f.ben).map((entry) => entry.tier), ["BERATER", "SENIOR", "JUNIOR_LEAD", "BERATER"]);
  // Jana wird Senior (ohne Team): Ben und Sven rutschen zu Tom.
  const down = changeRank(leader, f.jana, "SENIOR");
  assert.equal(down.moved, 2);
  assert.deepEqual([user(f.ben).manager_id, user(f.sven).manager_id], [f.tom, f.tom]);
  // Gleicher Rang: nichts passiert, kein Eintrag.
  assert.equal(changeRank(leader, f.jana, "SENIOR").moved, 0);
  assert.equal(rankHistory(f.jana).length, 2);
});

test("bereit: je Rang einmal gemeldet - an den direkten Chef, ohne Chef an die Geschaeftsfuehrung", () => {
  const f = fixture();
  const leader = user(f.leader);
  createGoal(leader, "SENIOR", { kind: "SALES", target: 2, period: "SINCE_RANK" });
  createGoal(leader, "TEAMLEITER", { kind: "TEAM_SUM", target: 2, period: "SINCE_RANK" });
  sale(f.ben, f.team, "STROM", "2026-11-03 10:00:00");
  assert.deepEqual(newlyReady(f.team, f.ben), []);
  sale(f.ben, f.team, "STROM", "2026-11-04 10:00:00");
  // Ben ist bereit fuer Senior - und Jana (Team-Summe 2) fuer Teamleiter.
  const first = newlyReady(f.team, f.ben);
  assert.deepEqual(first.map((entry) => [entry.name, entry.tier, entry.recipients]), [
    ["Ben", "SENIOR", [f.jana]],
    ["Jana", "TEAMLEITER", [f.tom]],
  ]);
  assert.deepEqual(newlyReady(f.team, f.ben), [], "nur einmal je Rang");
  assert.deepEqual([...readyIds(f.team)].sort(), [f.ben, f.jana].sort());
  // Nach der Befoerderung wird fuer den naechsten Rang neu gemeldet.
  changeRank(leader, f.ben, "SENIOR");
  createGoal(leader, "JUNIOR_LEAD", { kind: "SALES", target: 1, period: "SINCE_RANK" });
  sale(f.ben, f.team, "STROM", "2099-01-01 10:00:00");
  assert.deepEqual(newlyReady(f.team, f.ben).map((entry) => [entry.name, entry.tier]), [["Ben", "JUNIOR_LEAD"]]);
  // Paul steht direkt unter der Geschaeftsfuehrung: die bekommt die Meldung.
  sale(f.paul, f.team, "GAS", "2026-11-03 10:00:00");
  assert.deepEqual(newlyReady(f.team, f.paul).map((entry) => [entry.name, entry.recipients]), [["Paul", [f.leader]]]);
});
