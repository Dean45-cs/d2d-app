import crypto from "node:crypto";
import { getDb } from "./db";
import { AuthError } from "./auth";
import { CARD_TOKEN_LENGTH, isCardToken, type PublicCard } from "./business-card";
import { assertPermission, canManageMember } from "./permissions";
import type { User } from "./types";

/** Was die eigene Einstellungsseite der Visitenkarte braucht. */
export interface CardSettings {
  /** null: Karte ausgeschaltet. */
  token: string | null;
  showPhone: boolean;
  /** Rufnummer am Konto (traegt die Geschaeftsfuehrung ein) - "" ohne. */
  phone: string;
  badgeNumber: string;
  teamName: string;
}

export function cardSettings(userId: number): CardSettings {
  const row = getDb()
    .prepare(
      `SELECT u.card_token, u.card_phone, COALESCE(u.phone, '') AS phone, u.badge_number, t.name AS team_name
         FROM users u JOIN teams t ON t.id = u.team_id
        WHERE u.id = ?`,
    )
    .get(userId) as
    | { card_token: string | null; card_phone: number; phone: string; badge_number: string; team_name: string }
    | undefined;
  if (!row) throw new Error("Konto nicht gefunden.");
  return {
    token: row.card_token,
    showPhone: row.card_phone === 1,
    phone: row.phone.trim(),
    badgeNumber: row.badge_number,
    teamName: row.team_name,
  };
}

function newToken(): string {
  // 9 Bytes ergeben genau CARD_TOKEN_LENGTH Zeichen base64url.
  return crypto.randomBytes((CARD_TOKEN_LENGTH * 3) / 4).toString("base64url");
}

/**
 * Karte ein- oder ausschalten, Rufnummer zeigen, neuen Link erzeugen. Ein
 * neuer Link gilt sofort - der alte (und jeder QR-Code dazu) ist danach weg.
 */
export function updateCard(
  userId: number,
  change: { enabled?: boolean; showPhone?: boolean; renew?: boolean },
): CardSettings {
  const db = getDb();
  db.transaction(() => {
    const current = cardSettings(userId);
    if (change.showPhone !== undefined) {
      db.prepare("UPDATE users SET card_phone = ? WHERE id = ?").run(change.showPhone ? 1 : 0, userId);
    }
    if (change.enabled === false) {
      db.prepare("UPDATE users SET card_token = NULL WHERE id = ?").run(userId);
      return;
    }
    const needsToken = (change.enabled === true && !current.token) || (change.renew === true && current.token);
    if (!needsToken) return;
    // Zwei gleiche Zufallswerte sind praktisch ausgeschlossen - der Index faengt den Rest ab.
    for (let attempt = 0; ; attempt++) {
      try {
        db.prepare("UPDATE users SET card_token = ? WHERE id = ?").run(newToken(), userId);
        return;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== "SQLITE_CONSTRAINT_UNIQUE" || attempt >= 4) throw error;
      }
    }
  })();
  return cardSettings(userId);
}

/**
 * Die oeffentliche Karte zu einem Link - nur fuer aktive Konten. Die
 * Rufnummer kommt nur mit, wenn die Person sie zeigen will.
 */
export function publicCard(token: unknown): PublicCard | null {
  if (!isCardToken(token)) return null;
  const row = getDb()
    .prepare(
      `SELECT u.name, t.name AS team_name, u.avatar,
              CASE WHEN u.card_phone = 1 THEN COALESCE(u.phone, '') ELSE '' END AS phone,
              u.badge_number, u.created_at
         FROM users u JOIN teams t ON t.id = u.team_id
        WHERE u.card_token = ? AND u.active = 1`,
    )
    .get(token) as PublicCard | undefined;
  return row ? { ...row, phone: row.phone.trim() } : null;
}

/** Eine Zeile der Kartenuebersicht fuer die Leitung. */
export interface TeamCard {
  id: number;
  name: string;
  /** Adresse des Profilbilds, "" ohne Bild. */
  avatar: string;
  badgeNumber: string;
  /** null: Karte ausgeschaltet. */
  token: string | null;
}

/**
 * Die Kartenlinks der aktiven Personen, die `ids` nennt - fuer die Uebersicht
 * der Leitung (Ausweise drucken, Links verteilen). Einschalten bleibt Sache
 * jeder Person: wer die Karte aus hat, erscheint ohne Link. Mit Karte zuerst.
 */
export function teamCards(teamId: number, ids: number[]): TeamCard[] {
  if (ids.length === 0) return [];
  const rows = getDb()
    .prepare(
      `SELECT id, name, avatar_src(id, avatar) AS avatar, COALESCE(badge_number, '') AS badge_number, card_token
         FROM users
        WHERE team_id = ? AND active = 1 AND id IN (SELECT value FROM json_each(?))
        ORDER BY card_token IS NULL, name COLLATE NOCASE`,
    )
    .all(teamId, JSON.stringify(ids)) as Array<{
    id: number;
    name: string;
    avatar: string | null;
    badge_number: string;
    card_token: string | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    avatar: row.avatar ?? "",
    badgeNumber: row.badge_number,
    token: row.card_token,
  }));
}

/** Hoechstens so viele Karten auf einmal - mehr hat kein Team. */
const MAX_TEAM_CARDS = 500;

/**
 * Die Leitung schaltet Karten ihrer Leute ein oder aus oder erzeugt neue
 * Links - einzeln oder alle auf einmal. Erlaubt mit "Team verwalten" fuer
 * jede Person, die man auch unter Mitglieder verwalten darf, und fuer sich
 * selbst. Einschalten geht nur fuer aktive Konten. Alles oder nichts.
 */
export function updateTeamCards(
  actor: User,
  ids: unknown,
  change: { enabled?: boolean; renew?: boolean },
): number {
  assertPermission(actor, "team.manage");
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_TEAM_CARDS ||
    !ids.every((id) => Number.isSafeInteger(id) && id > 0)
  ) {
    throw new Error("Ungültige Auswahl.");
  }
  if (change.enabled === undefined && !change.renew) throw new Error("Nichts zu ändern.");
  const db = getDb();
  const find = db.prepare("SELECT * FROM users WHERE id = ? AND team_id = ?");
  const unique = [...new Set(ids as number[])];
  const targets = unique.map((id) => {
    const target = find.get(id, actor.team_id) as User | undefined;
    if (!target) throw new Error("Mitarbeiter nicht gefunden.");
    if (target.id !== actor.id && !canManageMember(actor, target)) {
      throw new AuthError("Diese Person gehört nicht zu deiner verwaltbaren Struktur.", 403);
    }
    if (change.enabled !== false && !target.active) throw new Error(`${target.name} ist deaktiviert.`);
    return target;
  });
  db.transaction(() => {
    for (const target of targets) updateCard(target.id, change);
  })();
  return targets.length;
}
