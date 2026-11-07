import { getDb } from "../db";
import { AuthError } from "../auth";
import { ValidationError } from "../api";
import { berlinToday, normalizeDay } from "../contracts";
import { hasPermission, permissionsFor, structureIds } from "../permissions";
import type { User } from "../types";
import {
  SPARTEN,
  classifyTariffs,
  comboBonuses,
  createCalculator,
  DEFAULT_SETTINGS,
  payoutLabel,
  providerKey,
  tariffBonuses,
  type BonusKind,
  type BonusScope,
  type Calculator,
  type CommissionBand,
  type CommissionBonus,
  type CommissionPerson,
  type CommissionRule,
  type CommissionSettings,
  type CommissionTariff,
  type EffectiveRule,
  type Payout,
  type PersonSetting,
  type RuleMode,
  type RuleScope,
  type Segment,
  type Sparte,
} from "./model";
import { isIndividual, tariffKey, type ImportRow } from "./table";

/*
 * Provisionen auf dem Server: laden, importieren, Regeln pflegen - und vor
 * allem, wer was sieht.
 *
 *   - Vertrieb: nur die eigenen Euro-Betraege. Keine Admin-Provision, kein
 *     Prozentsatz, nichts von den Ebenen darueber.
 *   - Fuehrungskraefte: zusaetzlich ihre Leute (nur nach unten) und was sie
 *     selbst an deren Vertraegen behalten.
 *   - "Provisionen verwalten" (Teamleitung): alles, auch "Ansicht als".
 *
 * Jede Ansicht wird hier zugeschnitten - was ein Browser nicht sehen darf,
 * verlaesst den Server gar nicht erst.
 */

export interface CommissionImport {
  id: number;
  label: string;
  valid_from: string;
  promo_until: string | null;
  row_count: number;
  created_at: string;
  created_by_name: string | null;
}

export interface CommissionMember extends CommissionPerson {
  name: string;
  avatar: string;
  active: number;
}

export interface TeamCommissions {
  latest: CommissionImport | null;
  tariffs: CommissionTariff[];
  settings: CommissionSettings;
  rules: CommissionRule[];
  people: PersonSetting[];
  bonuses: CommissionBonus[];
  members: CommissionMember[];
}

/* -------------------------------- Laden --------------------------------- */

export function latestImport(teamId: number): CommissionImport | null {
  return (getDb()
    .prepare(
      `SELECT i.id, i.label, i.valid_from, i.promo_until, i.row_count, i.created_at, u.name AS created_by_name
         FROM commission_imports i LEFT JOIN users u ON u.id = i.created_by
        WHERE i.team_id = ? ORDER BY i.id DESC LIMIT 1`,
    )
    .get(teamId) as CommissionImport | undefined) ?? null;
}

export function loadTariffs(teamId: number): CommissionTariff[] {
  const db = getDb();
  const tariffs = db
    .prepare(
      `SELECT id, provider, name, sparte, segment, needs_review, payout_conclusion, payout_connection,
              active, hidden, note
         FROM commission_tariffs WHERE team_id = ?
        ORDER BY provider COLLATE NOCASE, name COLLATE NOCASE`,
    )
    .all(teamId) as Array<Omit<CommissionTariff, "bands">>;
  const bands = db
    .prepare(
      `SELECT b.tariff_id, b.kwh_from, b.kwh_to, b.base_eur, b.promo_eur, b.follow_eur, b.individual
         FROM commission_bands b JOIN commission_tariffs t ON t.id = b.tariff_id
        WHERE t.team_id = ? ORDER BY b.tariff_id, b.kwh_from, b.kwh_to`,
    )
    .all(teamId) as Array<CommissionBand & { tariff_id: number }>;
  const byTariff = new Map<number, CommissionBand[]>();
  for (const { tariff_id, ...band } of bands) {
    const list = byTariff.get(tariff_id) ?? [];
    list.push(band);
    byTariff.set(tariff_id, list);
  }
  return tariffs.map((tariff) => ({ ...tariff, bands: byTariff.get(tariff.id) ?? [] }));
}

export function loadSettings(teamId: number): CommissionSettings {
  const row = getDb()
    .prepare("SELECT standard_percent, share_promo, share_follow, min_share FROM commission_settings WHERE team_id = ?")
    .get(teamId) as CommissionSettings | undefined;
  return row ?? { ...DEFAULT_SETTINGS };
}

function loadMembers(teamId: number): CommissionMember[] {
  return getDb()
    .prepare(
      `SELECT id, manager_id, role, name, avatar_src(id, avatar) AS avatar, active
         FROM users WHERE team_id = ? ORDER BY name COLLATE NOCASE`,
    )
    .all(teamId) as CommissionMember[];
}

export function loadTeamCommissions(teamId: number): TeamCommissions {
  const db = getDb();
  return {
    latest: latestImport(teamId),
    tariffs: loadTariffs(teamId),
    settings: loadSettings(teamId),
    rules: db
      .prepare("SELECT id, scope, scope_value, mode, value FROM commission_rules WHERE team_id = ? ORDER BY scope, scope_value")
      .all(teamId) as CommissionRule[],
    people: db
      .prepare("SELECT user_id, kind, value, manager_id FROM commission_people WHERE team_id = ?")
      .all(teamId) as PersonSetting[],
    bonuses: db
      .prepare(
        `SELECT id, kind, label, amount_eur, scope, scope_value, user_id, valid_from, valid_to, threshold,
                per_contract, active
           FROM commission_bonuses WHERE team_id = ? ORDER BY active DESC, COALESCE(valid_to, '9999') DESC, id DESC`,
      )
      .all(teamId) as CommissionBonus[],
    members: loadMembers(teamId),
  };
}

/** Die Aktionsprovision gilt bis zum letzten Tag der Liste - ohne Enddatum bis zur naechsten. */
export function promoActiveOn(latest: Pick<CommissionImport, "promo_until"> | null, day: string): boolean {
  return !latest?.promo_until || day <= latest.promo_until;
}

export function calculatorFor(data: TeamCommissions, day: string): Calculator {
  return createCalculator({
    settings: data.settings,
    rules: data.rules,
    people: data.people,
    members: data.members,
    promoActive: promoActiveOn(data.latest, day),
  });
}

/* ------------------------------- Zugriff -------------------------------- */

function assertManage(actor: User): void {
  if (!hasPermission(actor, "commissions.manage")) throw new AuthError("Keine Berechtigung: Provisionen verwalten.", 403);
}

/** Eigene Liste, die der eigenen Leute - oder mit "Provisionen verwalten" jede im Team. */
export function canViewCommissions(viewer: User, subjectId: number): boolean {
  if (!viewer.active) return false;
  if (subjectId === viewer.id) return true;
  const subject = getDb().prepare("SELECT id FROM users WHERE id = ? AND team_id = ?").get(subjectId, viewer.team_id);
  if (!subject) return false;
  return hasPermission(viewer, "commissions.manage") || structureIds(viewer).includes(subjectId);
}

/* --------------------------------- Ansicht ------------------------------ */

export interface ViewBand {
  from: number;
  to: number;
  /** Was die angezeigte Person bekommt; null = individuell bzw. noch nicht freigegeben. */
  now: number | null;
  promo: number;
  follow: number;
  individual: boolean;
  /** Fuehrungskraft: was sie selbst an diesem Vertrag behaelt. */
  keep?: number;
  /** Nur mit "Provisionen verwalten". */
  admin?: Payout;
  /** Nur mit "Provisionen verwalten": was die ganze Struktur ueber der Person kostet (ohne Boni). */
  chain?: Payout | null;
}

export interface ViewBonus {
  id: number;
  label: string;
  amount: number;
  until: string | null;
  personal: boolean;
  /** Gilt fuer alle Tarife - steht dann einmal oben statt an jeder Zeile. */
  everywhere: boolean;
}

export interface ViewTariff {
  id: number;
  provider: string;
  name: string;
  sparte: Sparte;
  segment: Segment;
  note: string;
  /** Wann die Provision kommt: "bei Abschluss" oder "bei Lieferbeginn". */
  timing: string;
  bands: ViewBand[];
  bonuses: ViewBonus[];
  /** Nur mit "Provisionen verwalten". */
  admin?: {
    needsReview: boolean;
    hidden: boolean;
    active: boolean;
    rule: EffectiveRule;
    /** Eigene Ausnahme genau fuer diesen Tarif, falls es eine gibt. */
    tariffRule: { id: number; mode: RuleMode; value: number } | null;
  };
}

export interface CommissionViewPerson {
  id: number;
  name: string;
  avatar: string;
}

export interface CommissionView {
  /** Wessen Liste - null: die Standardliste (nur mit "Provisionen verwalten"). */
  subject: CommissionViewPerson | null;
  /** Darf die Ansicht Admin-Betraege zeigen? */
  admin: boolean;
  /** Schaut eine Fuehrungskraft auf jemanden aus ihrer Struktur? */
  manager: boolean;
  configured: boolean;
  stand: { label: string; validFrom: string; promoUntil: string | null; promoActive: boolean } | null;
  tariffs: ViewTariff[];
  combo: ViewBonus[];
  day: string;
}

function viewBonus(bonus: CommissionBonus): ViewBonus {
  return {
    id: bonus.id,
    label: bonus.label,
    amount: bonus.amount_eur,
    until: bonus.valid_to,
    personal: bonus.user_id !== null,
    everywhere: bonus.scope === "ALL",
  };
}

/**
 * Die Provisionsliste, wie `viewer` sie sehen darf.
 * subjectId: wessen Liste; null nur mit "Provisionen verwalten" (Standardliste).
 */
export function commissionView(viewer: User, subjectId: number | null = viewer.id, day = berlinToday()): CommissionView {
  const admin = hasPermission(viewer, "commissions.manage");
  if (subjectId === null) {
    if (!admin) throw new AuthError("Keine Berechtigung: Provisionen verwalten.", 403);
  } else if (!canViewCommissions(viewer, subjectId)) {
    throw new AuthError("Diese Liste ist für dich nicht freigegeben.", 403);
  }
  const data = loadTeamCommissions(viewer.team_id);
  const calc = calculatorFor(data, day);
  const subject = subjectId === null ? null : data.members.find((member) => member.id === subjectId) ?? null;
  if (subjectId !== null && !subject) throw new Error("Person nicht gefunden.");
  // Die Teamleitung (ohne Verwaltungsrecht) hat keine eigene Partnerliste - ihre Provision ist die Admin-Provision.
  if (subject && subject.role === "LEADER" && !admin) throw new AuthError("Keine Berechtigung: Provisionen verwalten.", 403);

  const chain = subject ? calc.chain(subject.id) : [];
  // Fuehrungskraft schaut nach unten: ihre direkte Person in der Kette dieser Person.
  const viewerAt = chain.indexOf(viewer.id);
  const manager = !admin && subject !== null && subject.id !== viewer.id && viewerAt > 0;
  const directBelowViewer = manager ? chain[viewerAt - 1] : null;
  const top = chain.length > 0 ? chain[chain.length - 1] : null;
  const tariffRules = new Map(
    data.rules.filter((rule) => rule.scope === "TARIFF").map((rule) => [rule.scope_value, { id: rule.id, mode: rule.mode, value: rule.value }]),
  );

  const tariffs: ViewTariff[] = [];
  for (const tariff of data.tariffs) {
    if (!admin && (!tariff.active || tariff.hidden)) continue;
    const bands = tariff.bands.map((band): ViewBand => {
      const own = subject ? calc.person(subject.id, tariff, band) : calc.standard(tariff, band);
      const out: ViewBand = {
        from: band.kwh_from,
        to: band.kwh_to,
        now: own?.now ?? null,
        promo: own?.promo ?? 0,
        follow: own?.follow ?? 0,
        individual: Boolean(band.individual),
      };
      if (manager && directBelowViewer !== null && own) {
        const mine = calc.person(viewer.id, tariff, band);
        const below = calc.person(directBelowViewer, tariff, band);
        if (mine && below) out.keep = Math.max(0, Math.round((mine.now - below.now) * 100) / 100);
      }
      if (admin) {
        out.admin = calc.admin(band);
        // Die ganze Kette kostet so viel, wie die oberste Person aus dem Vertrieb bekommt.
        out.chain =
          subject === null
            ? calc.standard(tariff, band)
            : subject.role === "LEADER"
              ? { now: 0, promo: 0, follow: 0 }
              : top !== null
                ? calc.person(top, tariff, band)
                : null;
      }
      return out;
    });
    const bonuses = tariffBonuses(data.bonuses, tariff, subject?.id ?? -1, day)
      // Standardliste: nur Boni fuer alle.
      .filter((bonus) => subject !== null || bonus.user_id === null)
      .map(viewBonus);
    tariffs.push({
      id: tariff.id,
      provider: tariff.provider,
      name: tariff.name,
      sparte: tariff.sparte,
      segment: tariff.segment,
      note: tariff.note,
      timing: payoutLabel(tariff.payout_conclusion, tariff.payout_connection),
      bands,
      bonuses,
      ...(admin
        ? {
            admin: {
              needsReview: Boolean(tariff.needs_review),
              hidden: Boolean(tariff.hidden),
              active: Boolean(tariff.active),
              rule: calc.rule(tariff),
              tariffRule: tariffRules.get(String(tariff.id)) ?? null,
            },
          }
        : {}),
    });
  }

  return {
    subject: subject ? { id: subject.id, name: subject.name, avatar: subject.avatar } : null,
    admin,
    manager,
    configured: calc.configured,
    stand: data.latest
      ? {
          label: data.latest.label,
          validFrom: data.latest.valid_from,
          // Fuer den Vertrieb nur, solange die Aktion laeuft - danach ist das Datum ohne Belang.
          promoUntil: data.latest.promo_until,
          promoActive: calc.promoActive,
        }
      : null,
    tariffs,
    combo: comboBonuses(data.bonuses, subject?.id ?? -1, day)
      .filter((bonus) => subject !== null || bonus.user_id === null)
      .map(viewBonus),
    day,
  };
}

/* -------------------------------- Struktur ------------------------------ */

export interface StructurePerson {
  id: number;
  name: string;
  avatar: string;
  active: boolean;
  /** Ebene unter der betrachtenden Person (0 = direkt darunter) bzw. in der Teamansicht. */
  depth: number;
  managerId: number | null;
  managerName: string | null;
  kind: "RATE" | "SHARE";
  /** Eigener Wert in Prozent, null = Standard. */
  value: number | null;
  editable: boolean;
}

export interface CommissionStructure {
  admin: boolean;
  configured: boolean;
  /** Nur mit "Provisionen verwalten" - fuer alle anderen bleibt der Standardsatz unsichtbar. */
  standardPercent: number | null;
  minShare: number | null;
  people: StructurePerson[];
}

/**
 * Wer unter wem steht und was er bekommt. Fuehrungskraefte sehen nur ihre
 * Struktur (nach unten) und stellen ihre direkten Leute ein; mit
 * "Provisionen verwalten" das ganze Team.
 */
export function commissionStructure(viewer: User): CommissionStructure {
  const rights = permissionsFor(viewer);
  const admin = rights["commissions.manage"];
  const data = loadTeamCommissions(viewer.team_id);
  const calc = calculatorFor(data, berlinToday());
  const byId = new Map(data.members.map((member) => [member.id, member]));
  const visible = new Set(admin ? data.members.map((member) => member.id) : structureIds(viewer));

  // Baum von oben: in der Teamansicht ab der Teamleitung, sonst ab der betrachtenden Person.
  const children = new Map<number | null, CommissionMember[]>();
  for (const member of data.members) {
    const parent = member.manager_id !== null && byId.has(member.manager_id) ? member.manager_id : null;
    const list = children.get(parent) ?? [];
    list.push(member);
    children.set(parent, list);
  }
  const people: StructurePerson[] = [];
  const seen = new Set<number>();
  const add = (member: CommissionMember, depth: number) => {
    const setting = calc.setting(member.id);
    const kind = setting.kind === "SHARE" ? "SHARE" : "RATE";
    people.push({
      id: member.id,
      name: member.name,
      avatar: member.avatar,
      active: Boolean(member.active),
      depth,
      managerId: setting.managerId,
      managerName: setting.managerId !== null ? byId.get(setting.managerId)?.name ?? null : null,
      kind,
      value: setting.value,
      // Fuehrungskraefte stellen nur ihre direkten Leute ein - was die darunter bekommen, entscheiden diese.
      editable: admin || (rights["commissions.structure"] && kind === "SHARE" && setting.managerId === viewer.id),
    });
  };
  const walk = (parent: number | null, depth: number) => {
    for (const member of children.get(parent) ?? []) {
      if (seen.has(member.id)) continue;
      seen.add(member.id);
      // Teamleitungen stehen nicht in der Liste (sie bekommen die Admin-Provision), ihre Leute schon.
      if (member.role === "LEADER") {
        walk(member.id, depth);
        continue;
      }
      if (visible.has(member.id) && member.id !== viewer.id) add(member, depth);
      walk(member.id, depth + 1);
    }
  };
  // Teamansicht ab der Spitze, sonst ab der betrachtenden Person - die Ebenen darueber bleiben unsichtbar.
  walk(admin ? null : viewer.id, 0);
  if (admin) {
    // Was in einem Kreis haengt, kommt trotzdem vor.
    for (const member of data.members) {
      if (seen.has(member.id) || member.role === "LEADER") continue;
      seen.add(member.id);
      add(member, 0);
    }
  }
  return {
    admin,
    configured: calc.configured,
    standardPercent: admin ? data.settings.standard_percent : null,
    minShare: data.settings.min_share,
    people,
  };
}

/* ------------------------------ Aendern --------------------------------- */

function percentValue(value: unknown, field: string): number {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) throw new ValidationError(`${field} fehlt.`);
  if (n < 0 || n > 100) throw new ValidationError(`${field} muss zwischen 0 und 100 % liegen.`);
  return Math.round(n * 100) / 100;
}

function euroValue(value: unknown, field: string): number {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) throw new ValidationError(`${field} fehlt.`);
  if (n < 0 || n > 100_000) throw new ValidationError(`${field} ist kein gültiger Betrag.`);
  return Math.round(n * 100) / 100;
}

/** Standardsatz, Weitergabe von Aktions- und Folgeprovision, Untergrenze fuer Strukturen. */
export function saveCommissionSettings(
  actor: User,
  patch: { standardPercent?: unknown; sharePromo?: unknown; shareFollow?: unknown; minShare?: unknown },
): CommissionSettings {
  assertManage(actor);
  const current = loadSettings(actor.team_id);
  const next: CommissionSettings = { ...current };
  if (patch.standardPercent !== undefined) next.standard_percent = percentValue(patch.standardPercent, "Standardsatz");
  if (patch.sharePromo !== undefined) next.share_promo = patch.sharePromo ? 1 : 0;
  if (patch.shareFollow !== undefined) next.share_follow = patch.shareFollow ? 1 : 0;
  if (patch.minShare !== undefined) {
    next.min_share = patch.minShare === null || patch.minShare === "" ? null : percentValue(patch.minShare, "Untergrenze");
  }
  getDb()
    .prepare(
      `INSERT INTO commission_settings (team_id, standard_percent, share_promo, share_follow, min_share, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(team_id) DO UPDATE SET standard_percent = excluded.standard_percent, share_promo = excluded.share_promo,
         share_follow = excluded.share_follow, min_share = excluded.min_share, updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
    )
    .run(actor.team_id, next.standard_percent, next.share_promo, next.share_follow, next.min_share, actor.id);
  return next;
}

/** Bereich einer Regel oder eines Bonus pruefen - es muss ihn im Team geben. */
function scopeValue(teamId: number, scope: BonusScope, value: unknown): string {
  const text = String(value ?? "").trim();
  if (scope === "ALL") return "";
  if (scope === "SPARTE") {
    if (!SPARTEN.includes(text as Sparte)) throw new ValidationError("Unbekannte Sparte.");
    return text;
  }
  if (scope === "PROVIDER") {
    const providers = getDb().prepare("SELECT DISTINCT provider FROM commission_tariffs WHERE team_id = ?").all(teamId) as Array<{ provider: string }>;
    const match = providers.find((row) => providerKey(row.provider) === providerKey(text));
    if (!match) throw new ValidationError("Diesen Anbieter gibt es in der Liste nicht.");
    return match.provider;
  }
  const id = Number(text);
  const tariff = Number.isSafeInteger(id) && getDb().prepare("SELECT id FROM commission_tariffs WHERE id = ? AND team_id = ?").get(id, teamId);
  if (!tariff) throw new ValidationError("Tarif nicht gefunden.");
  return String(id);
}

function ruleScope(value: unknown): RuleScope {
  if (value === "SPARTE" || value === "PROVIDER" || value === "TARIFF") return value;
  throw new ValidationError("Unbekannter Bereich.");
}

/** Ausnahme anlegen oder ersetzen - je Sparte, Anbieter oder Tarif gibt es hoechstens eine. */
export function saveCommissionRule(actor: User, input: { scope?: unknown; scopeValue?: unknown; mode?: unknown; value?: unknown }): number {
  assertManage(actor);
  const scope = ruleScope(input.scope);
  const target = scopeValue(actor.team_id, scope, input.scopeValue);
  if (input.mode !== "FIXED" && input.mode !== "PERCENT") throw new ValidationError("Satz oder fester Betrag?");
  const mode: RuleMode = input.mode;
  const value = mode === "PERCENT" ? percentValue(input.value, "Satz") : euroValue(input.value, "Betrag");
  const db = getDb();
  db.prepare(
    `INSERT INTO commission_rules (team_id, scope, scope_value, mode, value, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(team_id, scope, scope_value) DO UPDATE SET mode = excluded.mode, value = excluded.value,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).run(actor.team_id, scope, target, mode, value, actor.id);
  const row = db.prepare("SELECT id FROM commission_rules WHERE team_id = ? AND scope = ? AND scope_value = ?").get(actor.team_id, scope, target) as { id: number };
  return row.id;
}

export function deleteCommissionRule(actor: User, id: number): void {
  assertManage(actor);
  const result = getDb().prepare("DELETE FROM commission_rules WHERE id = ? AND team_id = ?").run(id, actor.team_id);
  if (result.changes === 0) throw new Error("Ausnahme nicht gefunden.");
}

/**
 * Was eine Person bekommt. value null: zurueck auf Standard.
 *
 * - Direkt unter der Teamleitung (RATE): nur mit "Provisionen verwalten".
 * - Unter einer Fuehrungskraft aus dem Vertrieb (SHARE): die Fuehrungskraft
 *   selbst (mit "Provision der Struktur festlegen") oder die Verwaltung.
 * - Die eigene Provision legt immer jemand darueber fest.
 */
export function setPersonCommission(actor: User, targetId: number, value: unknown): void {
  if (!actor.active) throw new AuthError("Dein Konto ist deaktiviert.", 403);
  if (targetId === actor.id) throw new AuthError("Deine eigene Provision legt jemand über dir fest.", 403);
  const db = getDb();
  const target = db.prepare("SELECT id, manager_id, role FROM users WHERE id = ? AND team_id = ?").get(targetId, actor.team_id) as
    | { id: number; manager_id: number | null; role: string }
    | undefined;
  if (!target) throw new Error("Person nicht gefunden.");
  if (target.role === "LEADER") throw new ValidationError("Die Teamleitung bekommt die volle Admin-Provision.");
  const data = loadTeamCommissions(actor.team_id);
  const setting = calculatorFor(data, berlinToday()).setting(targetId);
  const kind = setting.kind === "SHARE" ? "SHARE" : "RATE";
  const rights = permissionsFor(actor);
  const admin = rights["commissions.manage"];
  if (!admin) {
    if (kind !== "SHARE" || setting.managerId !== actor.id) {
      throw new AuthError("Du legst nur fest, was deine direkten Leute bekommen.", 403);
    }
    if (!rights["commissions.structure"]) throw new AuthError("Keine Berechtigung: Provision der Struktur festlegen.", 403);
  }
  if (value === null || value === undefined || value === "") {
    db.prepare("DELETE FROM commission_people WHERE user_id = ?").run(targetId);
    return;
  }
  const percent = percentValue(value, kind === "SHARE" ? "Anteil" : "Satz");
  const floor = data.settings.min_share;
  if (!admin && kind === "SHARE" && floor !== null && percent < floor) {
    throw new ValidationError(`Mindestens ${floor.toLocaleString("de-DE")} % deiner Provision gehen an deine Leute.`);
  }
  db.prepare(
    `INSERT INTO commission_people (user_id, team_id, kind, value, manager_id, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET team_id = excluded.team_id, kind = excluded.kind, value = excluded.value,
       manager_id = excluded.manager_id, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).run(targetId, actor.team_id, kind, percent, target.manager_id, actor.id);
}

export function updateCommissionTariff(
  actor: User,
  id: number,
  patch: { sparte?: unknown; segment?: unknown; hidden?: unknown; note?: unknown },
): void {
  assertManage(actor);
  const db = getDb();
  const tariff = db.prepare("SELECT id FROM commission_tariffs WHERE id = ? AND team_id = ?").get(id, actor.team_id);
  if (!tariff) throw new Error("Tarif nicht gefunden.");
  const fields: string[] = [];
  const values: Array<string | number> = [];
  if (patch.sparte !== undefined) {
    if (!SPARTEN.includes(patch.sparte as Sparte)) throw new ValidationError("Unbekannte Sparte.");
    // Festgelegt ist festgelegt - auch wenn die Teamleitung die Vermutung nur bestaetigt.
    fields.push("sparte = ?", "needs_review = 0");
    values.push(String(patch.sparte));
  }
  if (patch.segment !== undefined) {
    if (patch.segment !== "PRIVAT" && patch.segment !== "GEWERBE") throw new ValidationError("Unbekannte Kundenart.");
    fields.push("segment = ?");
    values.push(patch.segment);
  }
  if (patch.hidden !== undefined) {
    fields.push("hidden = ?");
    values.push(patch.hidden ? 1 : 0);
  }
  if (patch.note !== undefined) {
    fields.push("note = ?");
    values.push(String(patch.note ?? "").trim().slice(0, 200));
  }
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE commission_tariffs SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values);
}

/* --------------------------------- Boni --------------------------------- */

export interface BonusInput {
  kind?: unknown;
  label?: unknown;
  amount?: unknown;
  scope?: unknown;
  scopeValue?: unknown;
  userId?: unknown;
  validFrom?: unknown;
  validTo?: unknown;
  active?: unknown;
}

function bonusKind(value: unknown): Exclude<BonusKind, "VOLUME"> {
  if (value === "TARIFF" || value === "PERSONAL" || value === "COMBO") return value;
  if (value === "VOLUME") throw new ValidationError("Staffel-Boni folgen mit der Auftragsübersicht.");
  throw new ValidationError("Unbekannte Bonusart.");
}

function day(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = normalizeDay(String(value));
  if (!normalized) throw new ValidationError(`${field} ist kein gültiges Datum.`);
  return normalized;
}

function checkedBonus(actor: User, input: BonusInput) {
  const kind = bonusKind(input.kind);
  const scope: BonusScope = kind === "COMBO" ? "ALL" : input.scope === undefined || input.scope === "ALL" ? "ALL" : ruleScope(input.scope);
  let userId: number | null = null;
  if (kind === "PERSONAL") {
    const id = Number(input.userId);
    const person = Number.isSafeInteger(id) && getDb().prepare("SELECT id FROM users WHERE id = ? AND team_id = ?").get(id, actor.team_id);
    if (!person) throw new ValidationError("Für wen ist der Bonus?");
    userId = id;
  }
  const validFrom = day(input.validFrom, "Beginn");
  const validTo = day(input.validTo, "Ende");
  if (validFrom && validTo && validFrom > validTo) throw new ValidationError("Das Ende liegt vor dem Beginn.");
  const amount = euroValue(input.amount, "Betrag");
  if (amount <= 0) throw new ValidationError("Der Bonus braucht einen Betrag.");
  return {
    kind,
    label: String(input.label ?? "").trim().slice(0, 80),
    amount,
    scope,
    scopeValue: scopeValue(actor.team_id, scope, input.scopeValue),
    userId,
    validFrom,
    validTo,
    active: input.active === undefined ? 1 : input.active ? 1 : 0,
  };
}

export function createCommissionBonus(actor: User, input: BonusInput): number {
  assertManage(actor);
  const bonus = checkedBonus(actor, input);
  return Number(
    getDb()
      .prepare(
        `INSERT INTO commission_bonuses (team_id, kind, label, amount_eur, scope, scope_value, user_id, valid_from, valid_to, active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(actor.team_id, bonus.kind, bonus.label, bonus.amount, bonus.scope, bonus.scopeValue, bonus.userId, bonus.validFrom, bonus.validTo, bonus.active, actor.id)
      .lastInsertRowid,
  );
}

export function updateCommissionBonus(actor: User, id: number, input: BonusInput): void {
  assertManage(actor);
  const db = getDb();
  const current = db.prepare("SELECT * FROM commission_bonuses WHERE id = ? AND team_id = ?").get(id, actor.team_id) as
    | { kind: string; label: string; amount_eur: number; scope: string; scope_value: string; user_id: number | null; valid_from: string | null; valid_to: string | null; active: number }
    | undefined;
  if (!current) throw new Error("Bonus nicht gefunden.");
  // Fehlende Felder bleiben, wie sie sind - so laesst sich etwa nur "aktiv" umschalten.
  const bonus = checkedBonus(actor, {
    kind: input.kind ?? current.kind,
    label: input.label ?? current.label,
    amount: input.amount ?? current.amount_eur,
    scope: input.scope ?? current.scope,
    scopeValue: input.scopeValue ?? current.scope_value,
    userId: input.userId ?? current.user_id,
    validFrom: input.validFrom !== undefined ? input.validFrom : current.valid_from,
    validTo: input.validTo !== undefined ? input.validTo : current.valid_to,
    active: input.active ?? current.active,
  });
  db.prepare(
    `UPDATE commission_bonuses SET kind = ?, label = ?, amount_eur = ?, scope = ?, scope_value = ?, user_id = ?,
       valid_from = ?, valid_to = ?, active = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(bonus.kind, bonus.label, bonus.amount, bonus.scope, bonus.scopeValue, bonus.userId, bonus.validFrom, bonus.validTo, bonus.active, id);
}

export function deleteCommissionBonus(actor: User, id: number): void {
  assertManage(actor);
  const result = getDb().prepare("DELETE FROM commission_bonuses WHERE id = ? AND team_id = ?").run(id, actor.team_id);
  if (result.changes === 0) throw new Error("Bonus nicht gefunden.");
}

/* -------------------------------- Import -------------------------------- */

interface ImportGroup {
  key: string;
  provider: string;
  name: string;
  rows: ImportRow[];
}

export interface ImportPreview {
  tariffs: number;
  bands: number;
  added: string[];
  changed: string[];
  unchanged: number;
  removed: string[];
  /** Neue Tarife, deren Sparte nur geraten ist. */
  review: string[];
  individual: number;
}

function groupRows(rows: ImportRow[]): ImportGroup[] {
  const groups = new Map<string, ImportGroup>();
  for (const row of rows) {
    const key = tariffKey(row.provider, row.name);
    const group = groups.get(key) ?? { key, provider: row.provider, name: row.name, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) group.rows.sort((a, b) => a.kwhFrom - b.kwhFrom || a.kwhTo - b.kwhTo);
  return [...groups.values()];
}

function bandSignature(bands: Array<Pick<CommissionBand, "kwh_from" | "kwh_to" | "base_eur" | "promo_eur" | "follow_eur">>): string {
  return bands.map((band) => [band.kwh_from, band.kwh_to, band.base_eur, band.promo_eur, band.follow_eur].join(":")).join("|");
}

function rowsAsBands(rows: ImportRow[]) {
  return rows.map((row) => ({ kwh_from: row.kwhFrom, kwh_to: row.kwhTo, base_eur: row.base, promo_eur: row.promo, follow_eur: row.follow }));
}

/** Zeilen erneut pruefen - sie kommen aus dem Browser. */
export function checkImportRows(value: unknown): ImportRow[] {
  if (!Array.isArray(value) || value.length === 0) throw new ValidationError("Die Liste enthält keine Zeilen.");
  if (value.length > 5000) throw new ValidationError("Bitte höchstens 5.000 Zeilen auf einmal übernehmen.");
  return value.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const text = (field: unknown, max: number) => String(field ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const num = (field: unknown, min: number, max: number, label: string) => {
      const n = Number(field);
      if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(`Zeile ${index + 1}: ${label} ist ungültig.`);
      return n;
    };
    const provider = text(item.provider, 120);
    const name = text(item.name, 160);
    if (!provider || !name) throw new ValidationError(`Zeile ${index + 1}: Anbieter oder Tarif fehlt.`);
    const kwhFrom = Math.round(num(item.kwhFrom, 0, 100_000_000, "Verbrauch von"));
    const kwhTo = Math.round(num(item.kwhTo, 0, 100_000_000, "Verbrauch bis"));
    if (kwhFrom > kwhTo) throw new ValidationError(`Zeile ${index + 1}: Verbrauch von ist größer als bis.`);
    return {
      line: Math.round(num(item.line ?? index + 2, 0, 1_000_000, "Zeile")),
      provider,
      name,
      kwhFrom,
      kwhTo,
      base: num(item.base, 0, 100_000, "Grundprovision"),
      promo: num(item.promo ?? 0, 0, 100_000, "Aktionsprovision"),
      follow: num(item.follow ?? 0, 0, 100_000, "Folgeprovision"),
      payoutConclusion: num(item.payoutConclusion ?? 1, 0, 1, "Abschluss"),
      payoutConnection: num(item.payoutConnection ?? 0, 0, 1, "Anschluss"),
    };
  });
}

/** Was ein Import aendern wuerde - nichts wird gespeichert. */
export function previewCommissionImport(teamId: number, rows: ImportRow[]): ImportPreview {
  const groups = groupRows(rows);
  const existing = new Map(loadTariffs(teamId).map((tariff) => [tariffKey(tariff.provider, tariff.name), tariff]));
  const classified = classifyTariffs(groups);
  const preview: ImportPreview = {
    tariffs: groups.length,
    bands: rows.length,
    added: [],
    changed: [],
    unchanged: 0,
    removed: [],
    review: [],
    individual: rows.filter(isIndividual).length,
  };
  const label = (group: { provider: string; name: string }) => `${group.provider} · ${group.name}`;
  groups.forEach((group, index) => {
    const before = existing.get(group.key);
    if (!before || !before.active) {
      preview.added.push(label(group));
      if (!before && classified[index].needsReview) preview.review.push(label(group));
      return;
    }
    if (bandSignature(before.bands) === bandSignature(rowsAsBands(group.rows))) preview.unchanged += 1;
    else preview.changed.push(label(group));
  });
  const incoming = new Set(groups.map((group) => group.key));
  for (const [key, tariff] of existing) {
    if (tariff.active && !incoming.has(key)) preview.removed.push(label(tariff));
  }
  return preview;
}

/**
 * Die neue Liste uebernehmen. Bekannte Tarife behalten ihre ID, Sparte,
 * Notiz und Sichtbarkeit (daran haengen Ausnahmen und Boni); ihre Staffeln
 * werden ersetzt. Was nicht mehr in der Liste steht, bleibt als "entfallen"
 * erhalten, bis es wieder auftaucht.
 */
export function commitCommissionImport(
  actor: User,
  rows: ImportRow[],
  meta: { label?: unknown; validFrom?: unknown; promoUntil?: unknown },
): ImportPreview & { importId: number } {
  assertManage(actor);
  const validFrom = day(meta.validFrom, "Stand") ?? berlinToday();
  const promoUntil = day(meta.promoUntil, "Aktion bis");
  if (promoUntil && promoUntil < validFrom) throw new ValidationError("Die Aktion endet vor dem Stand der Liste.");
  const label = String(meta.label ?? "").trim().slice(0, 120);
  const preview = previewCommissionImport(actor.team_id, rows);
  const groups = groupRows(rows);
  const classified = classifyTariffs(groups);
  const db = getDb();
  const importId = db.transaction(() => {
    const id = Number(
      db
        .prepare("INSERT INTO commission_imports (team_id, label, valid_from, promo_until, row_count, created_by) VALUES (?, ?, ?, ?, ?, ?)")
        .run(actor.team_id, label, validFrom, promoUntil, rows.length, actor.id).lastInsertRowid,
    );
    const existing = new Map(
      (db.prepare("SELECT id, provider, name FROM commission_tariffs WHERE team_id = ?").all(actor.team_id) as Array<{ id: number; provider: string; name: string }>)
        .map((row) => [tariffKey(row.provider, row.name), row.id]),
    );
    const insertTariff = db.prepare(
      `INSERT INTO commission_tariffs (team_id, provider, name, sparte, segment, needs_review, payout_conclusion, payout_connection, active, import_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    );
    const updateTariff = db.prepare(
      `UPDATE commission_tariffs SET provider = ?, name = ?, payout_conclusion = ?, payout_connection = ?, active = 1,
         import_id = ?, updated_at = datetime('now') WHERE id = ?`,
    );
    const clearBands = db.prepare("DELETE FROM commission_bands WHERE tariff_id = ?");
    const insertBand = db.prepare(
      `INSERT INTO commission_bands (tariff_id, kwh_from, kwh_to, base_eur, promo_eur, follow_eur, individual)
       VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tariff_id, kwh_from, kwh_to) DO UPDATE SET
         base_eur = excluded.base_eur, promo_eur = excluded.promo_eur, follow_eur = excluded.follow_eur, individual = excluded.individual`,
    );
    groups.forEach((group, index) => {
      const first = group.rows[0];
      let tariffId = existing.get(group.key);
      if (tariffId === undefined) {
        const guess = classified[index];
        tariffId = Number(
          insertTariff.run(actor.team_id, group.provider, group.name, guess.sparte, guess.segment, guess.needsReview ? 1 : 0,
            first.payoutConclusion, first.payoutConnection, id).lastInsertRowid,
        );
      } else {
        updateTariff.run(group.provider, group.name, first.payoutConclusion, first.payoutConnection, id, tariffId);
        clearBands.run(tariffId);
      }
      for (const row of group.rows) {
        insertBand.run(tariffId, row.kwhFrom, row.kwhTo, row.base, row.promo, row.follow, isIndividual(row) ? 1 : 0);
      }
    });
    const incoming = new Set(groups.map((group) => group.key));
    const deactivate = db.prepare("UPDATE commission_tariffs SET active = 0, updated_at = datetime('now') WHERE id = ?");
    for (const [key, tariffId] of existing) if (!incoming.has(key)) deactivate.run(tariffId);
    return id;
  }).immediate();
  return { ...preview, importId };
}

/* ------------------------------ Verwaltung ------------------------------ */

export interface AdminRule extends CommissionRule {
  /** "Gas", "EON", "E.ON Strom 24 · EON" */
  label: string;
}

export interface AdminBonus extends CommissionBonus {
  /** Wofuer er gilt: "alle Tarife", "EON", "E.ON Strom 24 · EON" */
  target: string;
  personName: string | null;
}

export interface CommissionAdmin {
  latest: CommissionImport | null;
  counts: { tariffs: number; review: number; inactive: number; hidden: number };
  settings: CommissionSettings;
  rules: AdminRule[];
  bonuses: AdminBonus[];
  providers: string[];
  tariffs: Array<{ id: number; provider: string; name: string; sparte: Sparte }>;
  members: Array<{ id: number; name: string; active: boolean }>;
}

/** Alles fuer die Seite "Provisionsregeln" - nur mit "Provisionen verwalten". */
export function commissionAdmin(actor: User): CommissionAdmin {
  assertManage(actor);
  const data = loadTeamCommissions(actor.team_id);
  const tariffs = new Map(data.tariffs.map((tariff) => [String(tariff.id), tariff]));
  const target = (scope: BonusScope, value: string): string => {
    if (scope === "ALL") return "alle Tarife";
    if (scope === "SPARTE") return { STROM: "Strom", GAS: "Gas", SONSTIGES: "Sonstiges" }[value as Sparte] ?? value;
    if (scope === "PROVIDER") return value;
    const tariff = tariffs.get(value);
    return tariff ? `${tariff.name} · ${tariff.provider}` : "Tarif nicht mehr in der Liste";
  };
  const names = new Map(data.members.map((member) => [member.id, member.name]));
  const active = data.tariffs.filter((tariff) => tariff.active);
  return {
    latest: data.latest,
    counts: {
      tariffs: active.length,
      review: active.filter((tariff) => tariff.needs_review).length,
      inactive: data.tariffs.length - active.length,
      hidden: active.filter((tariff) => tariff.hidden).length,
    },
    settings: data.settings,
    rules: data.rules
      .map((rule) => ({ ...rule, label: target(rule.scope, rule.scope_value) }))
      .sort((a, b) => ["SPARTE", "PROVIDER", "TARIFF"].indexOf(a.scope) - ["SPARTE", "PROVIDER", "TARIFF"].indexOf(b.scope) || a.label.localeCompare(b.label, "de")),
    bonuses: data.bonuses.map((bonus) => ({
      ...bonus,
      target: target(bonus.scope, bonus.scope_value),
      personName: bonus.user_id !== null ? names.get(bonus.user_id) ?? null : null,
    })),
    providers: [...new Set(active.map((tariff) => tariff.provider))].sort((a, b) => a.localeCompare(b, "de")),
    tariffs: active.map((tariff) => ({ id: tariff.id, provider: tariff.provider, name: tariff.name, sparte: tariff.sparte })),
    members: data.members
      .filter((member) => member.role !== "LEADER")
      .map((member) => ({ id: member.id, name: member.name, active: Boolean(member.active) })),
  };
}

/** Wessen Liste jemand ansehen darf - fuer "Ansicht als". Die eigene zuerst. */
export function viewablePeople(viewer: User): CommissionViewPerson[] {
  const admin = hasPermission(viewer, "commissions.manage");
  const below = new Set(structureIds(viewer));
  return loadMembers(viewer.team_id)
    .filter((member) => member.role !== "LEADER" && member.id !== viewer.id && (admin || below.has(member.id)))
    .map((member) => ({ id: member.id, name: member.name, avatar: member.avatar }));
}

/** Kleine Zahlen fuer Profil und Verwaltung - ohne die ganze Liste zu rechnen. */
export function commissionCounts(teamId: number): { tariffs: number; review: number; configured: boolean } {
  const db = getDb();
  const counts = db
    .prepare(
      `SELECT COUNT(*) AS tariffs, COALESCE(SUM(needs_review), 0) AS review
         FROM commission_tariffs WHERE team_id = ? AND active = 1`,
    )
    .get(teamId) as { tariffs: number; review: number };
  return { ...counts, configured: loadSettings(teamId).standard_percent !== null };
}
