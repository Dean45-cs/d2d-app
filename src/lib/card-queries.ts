import crypto from "node:crypto";
import { getDb } from "./db";
import { CARD_TOKEN_LENGTH, isCardToken, type PublicCard } from "./business-card";

/** Was die eigene Einstellungsseite der Visitenkarte braucht. */
export interface CardSettings {
  /** null: Karte ausgeschaltet. */
  token: string | null;
  showPhone: boolean;
  /** Rufnummer am Konto (traegt die Teamleitung ein) - "" ohne. */
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
