import { getDb } from "../db";
import { ACADEMY_MODULES, type AcademyModule } from "./content";
import type { AttemptScore } from "./score";

/**
 * Fortschritt in der Akademie: je Person und Modul eine Zeile
 * (academy_progress, src/lib/db.ts).
 *
 * Die Zeile gehoert zu einer Version des Moduls. Wird ein Modul
 * ueberarbeitet (version in content.ts hochgezaehlt), zaehlt das alte
 * Bestehen nicht mehr: die Person sieht "Neu ablegen", der naechste
 * Durchgang beginnt die Zaehlung von vorn.
 */

export interface ModuleProgress {
  moduleId: string;
  /** Durchgaenge in der aktuellen Version. */
  attempts: number;
  /** Bestes Ergebnis in Prozent, 0 ohne Durchgang. */
  bestScore: number;
  /** Wann die aktuelle Version zuerst bestanden wurde (SQLite-Zeitstempel). */
  passedAt: string | null;
  passed: boolean;
  /** Eine fruehere Version war bestanden - jetzt ist das Modul neu. */
  outdated: boolean;
}

interface ProgressRow {
  user_id: number;
  module_id: string;
  version: number;
  attempts: number;
  best_score: number;
  passed_at: string | null;
}

function toProgress(mod: AcademyModule, row: ProgressRow | undefined): ModuleProgress {
  const current = row !== undefined && row.version === mod.version;
  return {
    moduleId: mod.id,
    attempts: current ? row.attempts : 0,
    bestScore: current ? row.best_score : 0,
    passedAt: current ? row.passed_at : null,
    passed: current && row.passed_at !== null,
    outdated: row !== undefined && !current && row.passed_at !== null,
  };
}

/** Fortschritt einer Person, je Modul in der Reihenfolge der Akademie. */
export function progressFor(userId: number): ModuleProgress[] {
  const rows = getDb()
    .prepare(
      `SELECT user_id, module_id, version, attempts, best_score, passed_at
         FROM academy_progress WHERE user_id = ?`,
    )
    .all(userId) as ProgressRow[];
  const byModule = new Map(rows.map((row) => [row.module_id, row]));
  return ACADEMY_MODULES.map((mod) => toProgress(mod, byModule.get(mod.id)));
}

/** Wie viele Module eine Person bestanden hat - fuer Profil und Kopfzeile. */
export function passedCount(progress: ModuleProgress[]): number {
  return progress.filter((item) => item.passed).length;
}

/**
 * Einen Durchgang festhalten. Bestanden bleibt bestanden: ein schlechterer
 * Durchgang danach nimmt das Bestehen nicht zurueck, er zaehlt nur mit.
 */
export function recordAttempt(userId: number, mod: AcademyModule, result: AttemptScore): ModuleProgress {
  const db = getDb();
  const passed = result.passed ? 1 : 0;
  db.transaction(() => {
    const row = db
      .prepare("SELECT version FROM academy_progress WHERE user_id = ? AND module_id = ?")
      .get(userId, mod.id) as { version: number } | undefined;
    if (row && row.version === mod.version) {
      db.prepare(
        `UPDATE academy_progress
            SET attempts   = attempts + 1,
                best_score = MAX(best_score, ?),
                last_score = ?,
                passed_at  = COALESCE(passed_at, CASE WHEN ? = 1 THEN datetime('now') END),
                updated_at = datetime('now')
          WHERE user_id = ? AND module_id = ?`,
      ).run(result.score, result.score, passed, userId, mod.id);
      return;
    }
    // Erster Durchgang - oder der erste nach einer Ueberarbeitung des Moduls.
    db.prepare(
      `INSERT INTO academy_progress (user_id, module_id, version, attempts, best_score, last_score, passed_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, CASE WHEN ? = 1 THEN datetime('now') END, datetime('now'))
       ON CONFLICT (user_id, module_id) DO UPDATE SET
         version    = excluded.version,
         attempts   = 1,
         best_score = excluded.best_score,
         last_score = excluded.last_score,
         passed_at  = excluded.passed_at,
         updated_at = excluded.updated_at`,
    ).run(userId, mod.id, mod.version, result.score, result.score, passed);
  })();
  return progressFor(userId).find((item) => item.moduleId === mod.id)!;
}

export interface MemberAcademy {
  id: number;
  name: string;
  avatar: string;
  passed: number;
  /** Titel der Module, die noch fehlen - in der Reihenfolge der Akademie. */
  open: string[];
  /** Zuletzt etwas in der Akademie gemacht (SQLite-Zeitstempel), null = noch nie. */
  lastActivity: string | null;
}

export interface TeamAcademy {
  members: MemberAcademy[];
  /** Je Modul: wie viele der aktiven Personen es bestanden haben. */
  modules: Array<{ id: string; title: string; passed: number }>;
}

/** Stand des Teams: alle aktiven Personen, alphabetisch. */
export function teamAcademy(teamId: number): TeamAcademy {
  const db = getDb();
  const people = db
    .prepare(
      `SELECT id, name, avatar_src(id, avatar) AS avatar
         FROM users WHERE team_id = ? AND active = 1`,
    )
    .all(teamId) as Array<{ id: number; name: string; avatar: string }>;
  const rows = db
    .prepare(
      `SELECT p.user_id, p.module_id, p.version, p.attempts, p.best_score, p.passed_at, p.updated_at
         FROM academy_progress p JOIN users u ON u.id = p.user_id
        WHERE u.team_id = ? AND u.active = 1`,
    )
    .all(teamId) as Array<ProgressRow & { updated_at: string }>;

  const byUser = new Map<number, Map<string, ProgressRow & { updated_at: string }>>();
  for (const row of rows) {
    const own = byUser.get(row.user_id) ?? new Map();
    own.set(row.module_id, row);
    byUser.set(row.user_id, own);
  }

  const passedPerModule = new Map<string, number>(ACADEMY_MODULES.map((mod) => [mod.id, 0]));
  const members = people
    .map((person): MemberAcademy => {
      const own = byUser.get(person.id) ?? new Map();
      const open: string[] = [];
      let passed = 0;
      for (const mod of ACADEMY_MODULES) {
        if (toProgress(mod, own.get(mod.id)).passed) {
          passed += 1;
          passedPerModule.set(mod.id, (passedPerModule.get(mod.id) ?? 0) + 1);
        } else {
          open.push(mod.title);
        }
      }
      const stamps = [...own.values()].map((row) => row.updated_at).sort();
      return { ...person, passed, open, lastActivity: stamps.at(-1) ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return {
    members,
    modules: ACADEMY_MODULES.map((mod) => ({
      id: mod.id,
      title: mod.title,
      passed: passedPerModule.get(mod.id) ?? 0,
    })),
  };
}
