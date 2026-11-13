import crypto from "node:crypto";
import { AuthError, keyedHash } from "./auth";
import { ValidationError } from "./api";
import { getDb } from "./db";
import { FailureThrottle, retryText } from "./login-throttle";
import { hasPermission, permissionsFor } from "./permissions";
import { pushToUsers } from "./push";
import {
  INQUIRY_STATUS,
  INQUIRY_TOPICS,
  isInquiryStatus,
  isInquiryTopic,
  type InquiryCounts,
  type InquiryEvent,
  type InquiryRow,
  type InquiryStatus,
  type InquiryTopic,
  type InquiryView,
} from "./inquiry-labels";
import type { User } from "./types";

/*
 * Anfragen von der Website.
 *
 * Das Kontaktformular der Website schickt hierher - ohne Anmeldung. Jede
 * Eingabe gilt deshalb als feindlich, bis sie geprueft ist:
 *
 *   - nur bekannte Felder, jedes mit Laenge, Zeichensatz und Format
 *   - Steuer- und Richtungszeichen fliegen raus (keine versteckten Texte)
 *   - Honigtopf-Feld und Mindestzeit gegen Formular-Roboter
 *   - Bremse je Absender, je E-Mail und fuer alle zusammen
 *   - doppelte Absendungen landen nur einmal im Posteingang
 *   - die IP-Adresse wird nie gespeichert, nur ein Kennwert davon
 *   - Erledigtes und Spam loeschen sich nach einer Frist von selbst
 *
 * Wer die Anfragen sieht, regelt das Recht "Website-Anfragen bearbeiten";
 * wem eine Anfrage zugeteilt ist, sieht und bearbeitet genau diese.
 */

/* ============================== Grenzen ================================== */

export const LIMITS = {
  name: 100,
  email: 254,
  phone: 30,
  postalCode: 5,
  message: 4000,
  note: 2000,
  /** Groesster Anfragekoerper in Bytes - ein voller Text passt mehrfach hinein. */
  body: 32 * 1024,
} as const;
/** Kuerzeste Nachricht - "Hallo" allein hilft niemandem weiter. */
export const MIN_MESSAGE = 10;
/** Schneller ausgefuellt kann kein Mensch das Formular haben. */
export const MIN_FILL_MS = 2500;
/** Ab so vielen Links gilt eine Nachricht als Spam (landet im Spam-Ordner, nicht im Nichts). */
export const SPAM_LINKS = 3;

export const RATE = {
  /** Absendungen je Absender in 15 Minuten. */
  perClient: 5,
  /** Absendungen je Absender am Tag. */
  perClientDay: 20,
  /** Anfragen je E-Mail-Adresse in 15 Minuten. */
  perEmail: 3,
  /** Alle zusammen in 15 Minuten - schuetzt Datenbank und Posteingang vor Fluten. */
  global: 100,
} as const;

/** Spam verschwindet nach 30 Tagen, Erledigtes nach INQUIRY_RETENTION_DAYS (Standard 180). */
export const SPAM_RETENTION_DAYS = 30;
export function retentionDays(): number {
  const value = Number(process.env.INQUIRY_RETENTION_DAYS);
  return Number.isInteger(value) && value >= 1 && value <= 3650 ? value : 180;
}

/* ============================ Eingabe pruefen ============================= */

export interface InquiryInput {
  topic: InquiryTopic;
  name: string;
  email: string;
  phone: string;
  postalCode: string;
  message: string;
}

/** Feldfehler - die Website zeigt die Meldung direkt am Feld. */
export class InquiryFieldError extends ValidationError {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

export class RateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Zu viele Anfragen. Bitte ${retryText(retryAfterMs)} erneut versuchen.`);
  }
}

/*
 * Steuerzeichen (ausser Zeilenumbruch und Tab), Null-Breite-Zeichen und
 * Richtungsumschalter. Letztere koennen Text in der Anzeige umdrehen und so
 * etwa eine andere E-Mail-Adresse vortaeuschen.
 */
// Als Codepunkte geschrieben, damit die Zeichen selbst nie im Quelltext stehen.
const hex = (from: number, to = from) => (from === to ? `\\u{${from.toString(16)}}` : `\\u{${from.toString(16)}}-\\u{${to.toString(16)}}`);
const INVISIBLE = new RegExp(
  `[${[
    hex(0x00, 0x08), hex(0x0b), hex(0x0c), hex(0x0e, 0x1f), hex(0x7f, 0x9f),
    hex(0x200b, 0x200f), hex(0x2028, 0x2029), hex(0x202a, 0x202e),
    hex(0x2060, 0x2064), hex(0x2066, 0x2069), hex(0xfeff),
  ].join("")}]`,
  "gu",
);

/** Nur echte Zeichenketten; alles andere (Listen, Objekte, Zahlen) gilt als leer. */
function raw(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFC").replace(INVISIBLE, "") : "";
}

/** Eine Zeile: Umbrueche und Mehrfach-Leerzeichen werden zu einem Leerzeichen. */
export function singleLine(value: unknown): string {
  return raw(value).replace(/\s+/g, " ").trim();
}

/** Mehrere Zeilen: hoechstens zwei Leerzeilen am Stueck, einheitliche Umbrueche. */
export function multiLine(value: unknown): string {
  return raw(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/*
 * Bewusst streng: was hier durchkommt, landet spaeter in einem mailto-Link
 * und in der Anzeige. Vor dem @ nur Buchstaben, Ziffern und . _ + ' - -
 * kein ? & # % = (die koennten im mailto-Link weitere Empfaenger anhaengen),
 * keine Leerzeichen, Klammern oder Spitzklammern. Umlaut-Domains werden
 * vorher in ihre ASCII-Form (xn--) uebersetzt.
 */
const EMAIL = /^[A-Za-z0-9_+'-]+(?:\.[A-Za-z0-9_+'-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const PHONE = /^\+?[0-9 ()/.-]+$/;
const POSTAL_CODE = /^[0-9]{4,5}$/;
const LINK = /\bhttps?:\/\/|\bwww\.|\[url|<a\s/gi;

/** "Müller.de" -> "xn--mller-kva.de"; Ungueltiges bleibt, wie es ist, und faellt danach durch. */
function asciiDomain(domain: string): string {
  if (!domain || /[^\p{L}\p{N}.-]/u.test(domain)) return domain.toLowerCase();
  try {
    return new URL(`http://${domain}`).hostname;
  } catch {
    return domain.toLowerCase();
  }
}

export function normalizeEmail(value: unknown): string {
  const email = singleLine(value);
  const at = email.lastIndexOf("@");
  if (at < 0) return email;
  // Der Teil hinter dem @ ist unabhaengig von Gross- und Kleinschreibung.
  return `${email.slice(0, at)}@${asciiDomain(email.slice(at + 1))}`;
}

export function parseInquiry(input: Record<string, unknown>): InquiryInput {
  const topic = singleLine(input.topic).toUpperCase() || "BERATUNG";
  if (!isInquiryTopic(topic)) throw new InquiryFieldError("topic", "Bitte ein Anliegen auswählen.");

  const name = singleLine(input.name);
  if (name.length < 2) throw new InquiryFieldError("name", "Bitte Ihren Namen angeben.");
  if (name.length > LIMITS.name) throw new InquiryFieldError("name", `Der Name darf höchstens ${LIMITS.name} Zeichen haben.`);
  if (!/\p{L}/u.test(name) || /[<>{}[\]\\]|https?:|www\./i.test(name)) {
    throw new InquiryFieldError("name", "Bitte einen gültigen Namen angeben.");
  }

  const email = normalizeEmail(input.email);
  if (!email) throw new InquiryFieldError("email", "Bitte Ihre E-Mail-Adresse angeben.");
  if (email.length > LIMITS.email || !EMAIL.test(email) || email.split("@")[0].length > 64) {
    throw new InquiryFieldError("email", "Bitte eine gültige E-Mail-Adresse angeben.");
  }

  const phone = singleLine(input.phone);
  if (phone) {
    const digits = phone.replace(/\D/g, "").length;
    if (phone.length > LIMITS.phone || !PHONE.test(phone) || digits < 5 || digits > 20) {
      throw new InquiryFieldError("phone", "Bitte eine gültige Telefonnummer angeben – oder das Feld leer lassen.");
    }
  }

  const postalCode = singleLine(input.postalCode ?? input.plz);
  if (postalCode && !POSTAL_CODE.test(postalCode)) {
    throw new InquiryFieldError("postalCode", "Bitte eine gültige Postleitzahl angeben – oder das Feld leer lassen.");
  }

  const message = multiLine(input.message);
  if (message.length < MIN_MESSAGE) {
    throw new InquiryFieldError("message", `Bitte schreiben Sie uns kurz, worum es geht (mindestens ${MIN_MESSAGE} Zeichen).`);
  }
  if (message.length > LIMITS.message) {
    throw new InquiryFieldError("message", `Die Nachricht darf höchstens ${LIMITS.message} Zeichen haben.`);
  }

  if (!consented(input.consent)) {
    throw new InquiryFieldError("consent", "Bitte bestätigen Sie, dass Sie die Datenschutzerklärung gelesen haben.");
  }

  return { topic, name, email, phone, postalCode, message };
}

function consented(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1" || value === 1;
}

/**
 * Roboter erkennen, ohne Menschen zu stoeren: das unsichtbare Feld "website"
 * fuellt nur ein Programm aus, und in unter 2,5 Sekunden schreibt niemand
 * eine Nachricht. Fehlt die Zeitangabe (ohne JavaScript), zaehlt nur das Feld.
 */
export function looksAutomated(input: Record<string, unknown>): boolean {
  if (raw(input.website).trim() !== "") return true;
  if (input.elapsed === undefined || input.elapsed === null || input.elapsed === "") return false;
  const elapsed = Number(input.elapsed);
  return !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS;
}

/** Viele Links: wahrscheinlich Werbung. Kommt in den Spam-Ordner, wird aber nicht verworfen. */
export function looksLikeSpam(input: InquiryInput): boolean {
  return (input.message.match(LINK)?.length ?? 0) >= SPAM_LINKS;
}

/* ========================== Bremse gegen Fluten =========================== */

interface InquiryThrottles {
  short: FailureThrottle;
  day: FailureThrottle;
}

declare global {
  var __d2dInquiryThrottle: InquiryThrottles | undefined;
}

export function inquiryThrottles(): InquiryThrottles {
  globalThis.__d2dInquiryThrottle ??= {
    short: new FailureThrottle(15 * 60 * 1000),
    day: new FailureThrottle(24 * 60 * 60 * 1000),
  };
  return globalThis.__d2dInquiryThrottle;
}

/**
 * Jeder Versuch zaehlt, auch ein abgelehnter - sonst liesse sich die Pruefung
 * beliebig oft abtasten. Wirft, wenn ein Limit erreicht ist.
 */
export function checkRate(client: string, throttles = inquiryThrottles(), now = Date.now()): void {
  const wait = Math.max(
    throttles.short.blockedFor(`client:${client}`, RATE.perClient, now),
    throttles.day.blockedFor(`client:${client}`, RATE.perClientDay, now),
    throttles.short.blockedFor("global", RATE.global, now),
  );
  if (wait > 0) throw new RateLimitError(wait);
  throttles.short.fail(`client:${client}`, now);
  throttles.day.fail(`client:${client}`, now);
  throttles.short.fail("global", now);
}

export function checkEmailRate(email: string, throttles = inquiryThrottles(), now = Date.now()): void {
  const key = `email:${email.toLowerCase()}`;
  const wait = throttles.short.blockedFor(key, RATE.perEmail, now);
  if (wait > 0) throw new RateLimitError(wait);
  throttles.short.fail(key, now);
}

/* ============================== Annehmen ================================== */

export type ReceiveResult =
  | { kind: "stored"; id: number; status: InquiryStatus }
  | { kind: "duplicate"; id: number }
  /** Roboter: die Antwort sieht aus wie ein Erfolg, gespeichert wird nichts. */
  | { kind: "ignored" };

/** In welches Team Anfragen gehen: INQUIRY_TEAM_ID oder das erste Team. */
export function inquiryTeamId(): number | null {
  const configured = Number(process.env.INQUIRY_TEAM_ID);
  const db = getDb();
  if (Number.isSafeInteger(configured) && configured > 0) {
    const row = db.prepare("SELECT id FROM teams WHERE id = ?").get(configured) as { id: number } | undefined;
    if (row) return row.id;
  }
  const first = db.prepare("SELECT id FROM teams ORDER BY id LIMIT 1").get() as { id: number } | undefined;
  return first?.id ?? null;
}

/**
 * Eine Anfrage von der Website annehmen. `client` ist die Absenderadresse
 * (wird nur als Kennwert gespeichert), `source` die Herkunft der Seite.
 */
export function receiveInquiry(
  body: Record<string, unknown>,
  meta: { client: string; source: string },
  throttles = inquiryThrottles(),
  now = Date.now(),
): ReceiveResult {
  checkRate(meta.client, throttles, now);
  if (looksAutomated(body)) return { kind: "ignored" };
  const input = parseInquiry(body);
  checkEmailRate(input.email, throttles, now);

  const teamId = inquiryTeamId();
  if (teamId === null) throw new Error("Anfragen können gerade nicht angenommen werden.");

  const db = getDb();
  const fingerprint = keyedHash("inquiry-fingerprint", `${input.email.toLowerCase()}\n${input.message}`);
  // Doppelt abgeschickt (zweimal getippt, Seite neu geladen): nur einmal im Posteingang.
  const duplicate = db
    .prepare("SELECT id FROM inquiries WHERE fingerprint = ? AND created_at >= datetime('now', '-1 day') LIMIT 1")
    .get(fingerprint) as { id: number } | undefined;
  if (duplicate) return { kind: "duplicate", id: duplicate.id };

  const status: InquiryStatus = looksLikeSpam(input) ? "SPAM" : "NEW";
  const id = Number(
    db
      .prepare(
        `INSERT INTO inquiries (team_id, topic, name, email, phone, postal_code, message, status,
                                source, client_hash, fingerprint, consent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(
        teamId,
        input.topic,
        input.name,
        input.email,
        input.phone,
        input.postalCode,
        input.message,
        status,
        meta.source.slice(0, 200),
        keyedHash("inquiry-client", meta.client),
        fingerprint,
      ).lastInsertRowid,
  );
  purgeInquiries();
  if (status === "NEW") void notifyNewInquiry(teamId, id, input).catch((error) => console.error("[anfragen] Push", error));
  return { kind: "stored", id, status };
}

/** Wer neue Anfragen sieht: aktive Personen im Team mit dem Recht dazu. */
export function inquiryManagers(teamId: number): number[] {
  const users = getDb().prepare("SELECT * FROM users WHERE team_id = ? AND active = 1").all(teamId) as User[];
  return users.filter((user) => permissionsFor(user)["inquiries.manage"]).map((user) => user.id);
}

/*
 * Auf dem Sperrbildschirm steht nur Anliegen und PLZ - kein Name, keine
 * E-Mail, keine Nachricht. Die Details gibt es erst nach dem Entsperren.
 */
async function notifyNewInquiry(teamId: number, id: number, input: InquiryInput): Promise<void> {
  await pushToUsers(inquiryManagers(teamId), {
    title: "Neue Anfrage über die Website",
    body: [INQUIRY_TOPICS[input.topic], input.postalCode && `PLZ ${input.postalCode}`].filter(Boolean).join(" · "),
    url: `/anfragen?anfrage=${id}`,
    tag: `inquiry-${id}`,
  }, "inquiry");
}

/** Abgelaufenes loeschen: Spam nach 30 Tagen, Erledigtes nach der Aufbewahrungsfrist. */
export function purgeInquiries(): number {
  const result = getDb()
    .prepare(
      `DELETE FROM inquiries
        WHERE (status = 'SPAM' AND updated_at < datetime('now', ?))
           OR (status = 'DONE' AND COALESCE(closed_at, updated_at) < datetime('now', ?))`,
    )
    .run(`-${SPAM_RETENTION_DAYS} days`, `-${retentionDays()} days`);
  return result.changes;
}

/* ============================== Posteingang =============================== */

const SELECT = `
  SELECT i.id, i.topic, i.name, i.email, i.phone, i.postal_code, i.message, i.status,
         i.assigned_user_id, u.name AS assigned_name, i.source, i.created_at, i.updated_at, i.closed_at
    FROM inquiries i
    LEFT JOIN users u ON u.id = i.assigned_user_id`;

const VIEW_STATUS: Record<InquiryView, InquiryStatus[]> = {
  offen: ["NEW", "IN_PROGRESS"],
  erledigt: ["DONE"],
  spam: ["SPAM"],
};

export function canManageInquiries(user: User): boolean {
  return hasPermission(user, "inquiries.manage");
}

/** Ohne das Recht: nur die eigenen, zugeteilten Anfragen. */
function scope(user: User): { sql: string; params: unknown[] } {
  return canManageInquiries(user)
    ? { sql: "i.team_id = ?", params: [user.team_id] }
    : { sql: "i.team_id = ? AND i.assigned_user_id = ?", params: [user.team_id, user.id] };
}

/** Suchbegriff fuer LIKE - % und _ gelten als normale Zeichen. */
function likeTerm(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export function listInquiries(
  user: User,
  options: { view: InquiryView; query?: string; limit?: number },
): InquiryRow[] {
  const { sql, params } = scope(user);
  const statuses = VIEW_STATUS[options.view];
  const query = singleLine(options.query ?? "").slice(0, 80);
  const search = query
    ? ` AND (i.name LIKE ? ESCAPE '\\' OR i.email LIKE ? ESCAPE '\\' OR i.phone LIKE ? ESCAPE '\\'
           OR i.postal_code LIKE ? ESCAPE '\\' OR i.message LIKE ? ESCAPE '\\')`
    : "";
  const terms = query ? Array(5).fill(likeTerm(query)) : [];
  const limit = Math.max(1, Math.min(500, Math.round(options.limit ?? 200)));
  return getDb()
    .prepare(
      `${SELECT}
        WHERE ${sql} AND i.status IN (${statuses.map(() => "?").join(",")})${search}
        ORDER BY CASE i.status WHEN 'NEW' THEN 0 ELSE 1 END, i.id DESC
        LIMIT ?`,
    )
    .all(...params, ...statuses, ...terms, limit) as InquiryRow[];
}

export function countInquiries(user: User): InquiryCounts {
  const { sql, params } = scope(user);
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(i.status = 'NEW'), 0) AS new,
              COALESCE(SUM(i.status IN ('NEW','IN_PROGRESS')), 0) AS open,
              COALESCE(SUM(i.status = 'DONE'), 0) AS done,
              COALESCE(SUM(i.status = 'SPAM'), 0) AS spam
         FROM inquiries i WHERE ${sql}`,
    )
    .get(...params) as InquiryCounts;
  return row;
}

/** Eine Anfrage - nur wenn diese Person sie sehen darf, sonst "nicht gefunden". */
export function getInquiry(user: User, id: number): InquiryRow {
  if (!Number.isSafeInteger(id) || id < 1) throw new AuthError("Anfrage nicht gefunden.", 404);
  const { sql, params } = scope(user);
  const row = getDb().prepare(`${SELECT} WHERE i.id = ? AND ${sql}`).get(id, ...params) as InquiryRow | undefined;
  // Fremde und nicht vorhandene Anfragen sehen gleich aus - nichts verraet, welche IDs es gibt.
  if (!row) throw new AuthError("Anfrage nicht gefunden.", 404);
  return row;
}

export function inquiryEvents(user: User, id: number): InquiryEvent[] {
  getInquiry(user, id);
  return getDb()
    .prepare(
      `SELECT e.id, e.kind, e.body, e.user_id, u.name AS user_name, e.created_at
         FROM inquiry_events e LEFT JOIN users u ON u.id = e.user_id
        WHERE e.inquiry_id = ? ORDER BY e.id`,
    )
    .all(id) as InquiryEvent[];
}

/**
 * Bearbeiten: Status, Zuteilung, Notiz - alles in einem Schritt, alles im
 * Verlauf. Zuteilen und als Spam markieren darf nur, wer alle Anfragen
 * verwaltet; wem eine Anfrage zugeteilt ist, setzt Status und schreibt Notizen.
 */
export function updateInquiry(user: User, id: number, patch: Record<string, unknown>): InquiryRow {
  const current = getInquiry(user, id);
  const manager = canManageInquiries(user);
  const db = getDb();

  let status: InquiryStatus | undefined;
  if (patch.status !== undefined) {
    if (!isInquiryStatus(patch.status)) throw new ValidationError("Unbekannter Status.");
    if (patch.status === "SPAM" && !manager) throw new AuthError("Als Spam markieren darf nur, wer alle Anfragen verwaltet.", 403);
    if (patch.status !== current.status) status = patch.status;
  }

  let assignee: { id: number | null; name: string } | undefined;
  if (patch.assignedUserId !== undefined) {
    if (!manager) throw new AuthError("Anfragen zuteilen darf nur, wer alle Anfragen verwaltet.", 403);
    const value = patch.assignedUserId;
    if (value === null || value === "") {
      if (current.assigned_user_id !== null) assignee = { id: null, name: "" };
    } else {
      const target = Number(value);
      if (!Number.isSafeInteger(target) || target < 1) throw new ValidationError("Ungültige Person.");
      const row = db.prepare("SELECT id, name FROM users WHERE id = ? AND team_id = ? AND active = 1").get(target, user.team_id) as
        | { id: number; name: string }
        | undefined;
      if (!row) throw new ValidationError("Diese Person gehört nicht zum aktiven Team.");
      if (row.id !== current.assigned_user_id) assignee = row;
    }
  }

  let note = "";
  if (patch.note !== undefined) {
    note = multiLine(patch.note);
    if (note.length > LIMITS.note) throw new ValidationError(`Die Notiz darf höchstens ${LIMITS.note} Zeichen haben.`);
  }

  if (!status && !assignee && !note) return current;

  db.transaction(() => {
    const event = db.prepare("INSERT INTO inquiry_events (inquiry_id, user_id, kind, body) VALUES (?, ?, ?, ?)");
    if (status) {
      db.prepare(
        `UPDATE inquiries SET status = ?, updated_at = datetime('now'),
                closed_at = CASE WHEN ? IN ('DONE','SPAM') THEN datetime('now') ELSE NULL END
          WHERE id = ?`,
      ).run(status, status, id);
      event.run(id, user.id, "STATUS", status);
    }
    if (assignee) {
      db.prepare("UPDATE inquiries SET assigned_user_id = ?, updated_at = datetime('now') WHERE id = ?").run(assignee.id, id);
      event.run(id, user.id, "ASSIGN", assignee.name);
    }
    if (note) {
      db.prepare("UPDATE inquiries SET updated_at = datetime('now') WHERE id = ?").run(id);
      event.run(id, user.id, "NOTE", note);
    }
  })();

  if (assignee?.id && assignee.id !== user.id) {
    void pushToUsers([assignee.id], {
      title: `${user.name} hat dir eine Anfrage zugeteilt`,
      body: [INQUIRY_TOPICS[current.topic], current.postal_code && `PLZ ${current.postal_code}`].filter(Boolean).join(" · "),
      url: `/anfragen?anfrage=${id}`,
      tag: `inquiry-${id}`,
    }, "inquiry").catch((error) => console.error("[anfragen] Push", error));
  }
  // Nach dem Wegnehmen der Zuteilung sieht die Person die Anfrage evtl. nicht mehr.
  return manager ? getInquiry(user, id) : { ...current, status: status ?? current.status };
}

/** Endgueltig loeschen - etwa auf Wunsch der Person (DSGVO Art. 17). */
export function deleteInquiry(user: User, id: number): void {
  if (!canManageInquiries(user)) throw new AuthError("Löschen darf nur, wer alle Anfragen verwaltet.", 403);
  getInquiry(user, id);
  getDb().prepare("DELETE FROM inquiries WHERE id = ? AND team_id = ?").run(id, user.team_id);
}

/** Wem man zuteilen kann: die aktiven Personen im Team. */
export function inquiryAssignees(user: User): Array<{ id: number; name: string }> {
  return getDb()
    .prepare("SELECT id, name FROM users WHERE team_id = ? AND active = 1 ORDER BY name")
    .all(user.team_id) as Array<{ id: number; name: string }>;
}

/** Hat diese Person ueberhaupt etwas im Posteingang zu suchen? */
export function hasInquiryAccess(user: User): boolean {
  if (canManageInquiries(user)) return true;
  return Boolean(
    getDb().prepare("SELECT 1 FROM inquiries WHERE team_id = ? AND assigned_user_id = ? LIMIT 1").get(user.team_id, user.id),
  );
}

/* ======================= Herkunft und Anfragekoerper ====================== */

/**
 * Von welchen Seiten das Formular abschicken darf: INQUIRY_ALLOWED_ORIGINS
 * (Komma-Liste, z. B. "https://carlssonsales.de,https://www.carlssonsales.de").
 * Die eigene Adresse der App gilt immer. In der Entwicklung zusaetzlich localhost.
 */
export function allowedOrigins(env = process.env): string[] {
  return (env.INQUIRY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      try {
        const url = new URL(entry);
        return url.protocol === "https:" || url.protocol === "http:" ? [url.origin] : [];
      } catch {
        return [];
      }
    });
}

export function isAllowedOrigin(origin: string | null, headers: Headers, env = process.env): boolean {
  if (!origin || origin === "null") return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (allowedOrigins(env).includes(parsed.origin)) return true;
  // Gleiche Adresse wie die App selbst (Website und App unter einer Domain).
  const host = headers.get("x-forwarded-host")?.split(",")[0].trim() || headers.get("host")?.trim();
  if (host && parsed.host === host) return true;
  if (env.NODE_ENV !== "production" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) return true;
  return false;
}

export class PayloadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Anfragekoerper lesen - hoechstens `max` Bytes, nur gueltiges UTF-8. Ein
 * groesserer Koerper wird gar nicht erst vollstaendig gelesen.
 */
export async function readLimitedBody(request: Request, max = LIMITS.body): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) throw new PayloadError(413, "Die Anfrage ist zu groß.");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      throw new PayloadError(413, "Die Anfrage ist zu groß.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PayloadError(400, "Die Anfrage ist nicht lesbar.");
  }
}

const FIELDS = ["topic", "name", "email", "phone", "postalCode", "plz", "message", "consent", "website", "elapsed"] as const;

/** JSON oder klassisches Formular - es kommen nur die bekannten Felder weiter. */
export function parseBody(text: string, contentType: string): Record<string, unknown> {
  const type = contentType.split(";")[0].trim().toLowerCase();
  let source: Record<string, unknown>;
  if (type === "application/json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new PayloadError(400, "Die Anfrage ist nicht lesbar.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new PayloadError(400, "Die Anfrage ist nicht lesbar.");
    source = parsed as Record<string, unknown>;
  } else if (type === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams(text);
    source = {};
    // Mehrfach vorkommende Felder: das erste zaehlt.
    for (const key of FIELDS) if (params.has(key)) source[key] = params.get(key);
  } else {
    throw new PayloadError(415, "Dieses Format wird nicht angenommen.");
  }
  const out: Record<string, unknown> = {};
  for (const key of FIELDS) if (Object.hasOwn(source, key)) out[key] = source[key];
  return out;
}

/** Kurzform fuer Protokolle: nie die Nachricht, nie die Adresse. */
export function requestId(): string {
  return crypto.randomBytes(6).toString("hex");
}

export { INQUIRY_STATUS, INQUIRY_TOPICS };
