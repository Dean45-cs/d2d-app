import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import {
  ACADEMY_MODULES,
  PASS_PERCENT,
  RED_LINES,
  findModule,
  nextModule,
  type AcademyModule,
} from "../../src/lib/academy/content";
import { checkAnswer, percentOf, publicQuiz, readAnswers, scoreAttempt } from "../../src/lib/academy/score";
import { passedCount, progressFor, recordAttempt, teamAcademy } from "../../src/lib/academy/store";
import { navigation } from "../../src/lib/nav";
import { permissionsFor } from "../../src/lib/permissions";
import type { User } from "../../src/lib/types";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-academy-"));
const previous = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = path.join(directory, "test.db");
const db = getDb();
after(() => {
  db.close(); global.__d2dDb = undefined;
  if (previous === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previous;
  rmSync(directory, { recursive: true, force: true });
});

let sequence = 0;
function newTeam(): number {
  return Number(db.prepare("INSERT INTO teams(name) VALUES ('Akademie-Team')").run().lastInsertRowid);
}
function person(team: number, name: string, role: "LEADER" | "MEMBER" = "MEMBER", active = 1): User {
  const id = Number(
    db.prepare("INSERT INTO users(team_id, name, email, password_hash, role, active) VALUES (?, ?, ?, '', ?, ?)")
      .run(team, name, `akademie-${++sequence}@example.test`, role, active).lastInsertRowid,
  );
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
}

/** Alle richtig. */
function perfect(mod: AcademyModule): number[] {
  return mod.quiz.map((question) => question.answer);
}
/** Die ersten n Fragen falsch, der Rest richtig. */
function withMistakes(mod: AcademyModule, n: number): number[] {
  return mod.quiz.map((question, index) =>
    index < n ? (question.answer + 1) % question.options.length : question.answer,
  );
}
/** Fehler wie bei falschen Eingaben: kein TypeError/RangeError - die werden sonst zur 500. */
function inputError(error: unknown): boolean {
  return error instanceof Error && !(error instanceof TypeError) && !(error instanceof RangeError);
}

test("Inhalte: eindeutige Adressen, vollständige Regeln, gültige Lösungen", () => {
  const ids = ACADEMY_MODULES.map((mod) => mod.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ACADEMY_MODULES.length >= 6);
  // "team" ist die Seite fuer die Leitung (/akademie/team) - kein Modul darf so heissen.
  for (const id of ids) assert.match(id, /^[a-z][a-z-]*$/);
  assert.ok(!ids.includes("team"));

  const questionIds = new Set<string>();
  for (const mod of ACADEMY_MODULES) {
    assert.ok(Number.isInteger(mod.version) && mod.version >= 1, mod.id);
    assert.ok(mod.title && mod.summary && mod.minutes > 0, mod.id);
    assert.ok(mod.lessons.length >= 2, mod.id);
    for (const lesson of mod.lessons) {
      assert.ok(lesson.title && lesson.text && lesson.rules.length > 0, `${mod.id}: ${lesson.title}`);
      for (const rule of lesson.rules) {
        assert.ok(rule.text.trim().length > 0);
        // Jede Verhaltensregel sagt, woher sie kommt; ein Gesetz nennt seine Fundstelle.
        if (rule.kind !== "info") assert.ok(rule.basis === "law" || rule.basis === "house", rule.text);
        if (rule.basis === "law") assert.ok(rule.ref, rule.text);
      }
      if (lesson.example) assert.ok(lesson.example.situation && lesson.example.wrong && lesson.example.right);
    }
    assert.ok(mod.quiz.length >= 5, mod.id);
    for (const question of mod.quiz) {
      assert.ok(!questionIds.has(question.id), `doppelte Frage ${question.id}`);
      questionIds.add(question.id);
      assert.ok(question.options.length >= 3, question.id);
      assert.equal(new Set(question.options).size, question.options.length, question.id);
      assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length, question.id);
      assert.ok(question.explanation.trim().length > 20, question.id);
    }
    // Ein Fehler ist erlaubt, zwei Drittel richtig reichen nicht.
    assert.equal(scoreAttempt(mod, withMistakes(mod, 1)).passed, true, mod.id);
    assert.equal(scoreAttempt(mod, withMistakes(mod, Math.ceil(mod.quiz.length / 3))).passed, false, mod.id);
  }

  assert.ok(RED_LINES.length >= 8);
  for (const line of RED_LINES) if (line.basis === "law") assert.ok(line.ref, line.text);

  assert.equal(findModule("auftreten")?.title, "Auftreten & erster Eindruck");
  assert.equal(findModule("gibt-es-nicht"), undefined);
  assert.equal(nextModule(ACADEMY_MODULES[0].id)?.id, ACADEMY_MODULES[1].id);
  assert.equal(nextModule(ACADEMY_MODULES.at(-1)!.id), undefined);
});

test("Quiz: Lösungen und Erklärungen bleiben auf dem Server", () => {
  for (const mod of ACADEMY_MODULES) {
    const shown = publicQuiz(mod);
    assert.equal(shown.length, mod.quiz.length);
    for (const question of shown) assert.deepEqual(Object.keys(question).sort(), ["id", "options", "text"]);
    const json = JSON.stringify(shown);
    for (const question of mod.quiz) assert.ok(!json.includes(question.explanation), question.id);
  }
});

test("Quiz: Antworten prüfen, Durchgang werten, falsche Eingaben ablehnen", () => {
  const mod = ACADEMY_MODULES[0];
  const first = mod.quiz[0];
  const right = checkAnswer(mod, 0, first.answer);
  assert.deepEqual(right, { correct: true, answer: first.answer, explanation: first.explanation });
  const wrong = checkAnswer(mod, 0, (first.answer + 1) % first.options.length);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.answer, first.answer);

  for (const [question, choice] of [[-1, 0], [mod.quiz.length, 0], [0, first.options.length], [0, 1.5], ["0", 0], [0, null]]) {
    assert.throws(() => checkAnswer(mod, question, choice), inputError);
  }
  assert.throws(() => readAnswers(mod, undefined), inputError);
  assert.throws(() => readAnswers(mod, perfect(mod).slice(1)), inputError);
  assert.throws(() => readAnswers(mod, [...perfect(mod).slice(1), 99]), inputError);
  assert.deepEqual(readAnswers(mod, perfect(mod)), perfect(mod));

  assert.deepEqual(scoreAttempt(mod, perfect(mod)), { correct: mod.quiz.length, total: mod.quiz.length, score: 100, passed: true });
  const twoWrong = scoreAttempt(mod, withMistakes(mod, 2));
  assert.equal(twoWrong.correct, mod.quiz.length - 2);
  assert.equal(twoWrong.score, percentOf(mod.quiz.length - 2, mod.quiz.length));
  assert.equal(percentOf(5, 6), 83);
  assert.equal(percentOf(4, 5), PASS_PERCENT);
  assert.equal(percentOf(0, 0), 0);
});

test("Fortschritt: Bestehen bleibt, überarbeitete Module zählen neu", () => {
  const team = newTeam();
  const anna = person(team, "Anna Berger");
  const mod = ACADEMY_MODULES[2];

  const fresh = progressFor(anna.id);
  assert.equal(fresh.length, ACADEMY_MODULES.length);
  assert.deepEqual(fresh.map((item) => item.moduleId), ACADEMY_MODULES.map((item) => item.id));
  assert.ok(fresh.every((item) => item.attempts === 0 && !item.passed && !item.outdated && item.passedAt === null));

  const failed = recordAttempt(anna.id, mod, scoreAttempt(mod, withMistakes(mod, 2)));
  assert.equal(failed.attempts, 1);
  assert.equal(failed.passed, false);
  assert.equal(failed.bestScore, percentOf(mod.quiz.length - 2, mod.quiz.length));

  const passed = recordAttempt(anna.id, mod, scoreAttempt(mod, perfect(mod)));
  assert.equal(passed.attempts, 2);
  assert.equal(passed.passed, true);
  assert.equal(passed.bestScore, 100);
  assert.ok(passed.passedAt);

  // Ein schlechterer Durchgang danach nimmt nichts zurueck.
  const again = recordAttempt(anna.id, mod, scoreAttempt(mod, withMistakes(mod, 3)));
  assert.equal(again.attempts, 3);
  assert.equal(again.passed, true);
  assert.equal(again.bestScore, 100);
  assert.equal(again.passedAt, passed.passedAt);
  assert.equal(passedCount(progressFor(anna.id)), 1);

  // Das Modul wird ueberarbeitet: der alte Stand gehoert zu einer frueheren Fassung.
  db.prepare("UPDATE academy_progress SET version = version - 1 WHERE user_id = ? AND module_id = ?").run(anna.id, mod.id);
  const outdated = progressFor(anna.id).find((item) => item.moduleId === mod.id)!;
  assert.equal(outdated.passed, false);
  assert.equal(outdated.outdated, true);
  assert.equal(outdated.attempts, 0);
  assert.equal(passedCount(progressFor(anna.id)), 0);

  const renewed = recordAttempt(anna.id, mod, scoreAttempt(mod, withMistakes(mod, 1)));
  assert.equal(renewed.attempts, 1);
  assert.equal(renewed.passed, true);
  assert.equal(renewed.outdated, false);
  assert.equal(renewed.bestScore, percentOf(mod.quiz.length - 1, mod.quiz.length));

  // Wer geloescht wird, nimmt seinen Stand mit.
  db.prepare("DELETE FROM users WHERE id = ?").run(anna.id);
  const left = db.prepare("SELECT COUNT(*) AS n FROM academy_progress WHERE user_id = ?").get(anna.id) as { n: number };
  assert.equal(left.n, 0);
});

test("Team: Stand je Person und Modul, nur aktive Personen des eigenen Teams", () => {
  const team = newTeam();
  const leader = person(team, "Dana Leitung", "LEADER");
  const zoe = person(team, "Zoe Klein");
  const ben = person(team, "Ben Albers");
  const gone = person(team, "Paul Früher", "MEMBER", 0);
  const stranger = person(newTeam(), "Fremd Person");

  for (const mod of ACADEMY_MODULES) recordAttempt(zoe.id, mod, scoreAttempt(mod, perfect(mod)));
  recordAttempt(ben.id, ACADEMY_MODULES[0], scoreAttempt(ACADEMY_MODULES[0], perfect(ACADEMY_MODULES[0])));
  recordAttempt(ben.id, ACADEMY_MODULES[1], scoreAttempt(ACADEMY_MODULES[1], withMistakes(ACADEMY_MODULES[1], 3)));
  recordAttempt(gone.id, ACADEMY_MODULES[0], scoreAttempt(ACADEMY_MODULES[0], perfect(ACADEMY_MODULES[0])));
  recordAttempt(stranger.id, ACADEMY_MODULES[0], scoreAttempt(ACADEMY_MODULES[0], perfect(ACADEMY_MODULES[0])));

  const { members, modules } = teamAcademy(team);
  assert.deepEqual(members.map((member) => member.name), ["Ben Albers", "Dana Leitung", "Zoe Klein"]);

  const byName = new Map(members.map((member) => [member.name, member]));
  assert.equal(byName.get("Zoe Klein")!.passed, ACADEMY_MODULES.length);
  assert.deepEqual(byName.get("Zoe Klein")!.open, []);
  assert.equal(byName.get("Ben Albers")!.passed, 1);
  assert.deepEqual(byName.get("Ben Albers")!.open, ACADEMY_MODULES.slice(1).map((mod) => mod.title));
  assert.ok(byName.get("Ben Albers")!.lastActivity);
  assert.equal(byName.get("Dana Leitung")!.passed, 0);
  assert.equal(byName.get("Dana Leitung")!.lastActivity, null);

  assert.deepEqual(modules.map((entry) => entry.id), ACADEMY_MODULES.map((mod) => mod.id));
  assert.equal(modules[0].passed, 2);
  assert.equal(modules[1].passed, 1);
  assert.ok(modules.slice(2).every((entry) => entry.passed === 1));
  assert.ok(leader.id > 0);
});

test("Navigation: Akademie für alle, Team-Stand mit der Teamauswertung", () => {
  const team = newTeam();
  const leader = person(team, "Lea Leitung", "LEADER");
  const member = person(team, "Max Vertrieb");

  for (const user of [leader, member]) {
    const nav = navigation(user.role, permissionsFor(user), user.id);
    assert.ok(nav.items.some((item) => item.href === "/akademie" && item.icon === "academy"));
    assert.ok(nav.sidebar[0].items.some((item) => item.href === "/akademie"));
    // Auf dem Handy gehoert die Akademie zum Reiter "Profil".
    assert.ok(nav.tabs.find((tab) => tab.href === "/profil")?.match?.includes("/akademie"));
  }
  assert.equal(permissionsFor(leader)["reports.team"], true);
  assert.equal(permissionsFor(member)["reports.team"], false);
});
