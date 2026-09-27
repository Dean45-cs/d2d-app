import crypto from "node:crypto";

/**
 * Token fuer Apple MapKit JS.
 *
 * Zwei Wege:
 *  - APPLE_MAPKIT_TOKEN: ein im Apple-Developer-Konto erzeugtes Token
 *    (Certificates, IDs & Profiles -> Keys bzw. Maps Tokens). Wird so
 *    weitergereicht, wie es ist.
 *  - APPLE_MAPKIT_TEAM_ID + APPLE_MAPKIT_KEY_ID + APPLE_MAPKIT_PRIVATE_KEY:
 *    der Server signiert selbst kurzlebige Tokens (ES256). Der Schluessel
 *    verlaesst den Server nie.
 */

const LIFETIME_SECONDS = 60 * 60;

let cached: { token: string; expires: number } | null = null;

export function mapkitToken(): string | null {
  const fixed = process.env.APPLE_MAPKIT_TOKEN?.trim();
  if (fixed) return fixed;

  const teamId = process.env.APPLE_MAPKIT_TEAM_ID?.trim();
  const keyId = process.env.APPLE_MAPKIT_KEY_ID?.trim();
  const rawKey = process.env.APPLE_MAPKIT_PRIVATE_KEY;
  if (!teamId || !keyId || !rawKey) return null;

  const now = Math.floor(Date.now() / 1000);
  // Fuenf Minuten Puffer, damit kein Token kurz vor Ablauf ausgeliefert wird.
  if (cached && cached.expires - 300 > now) return cached.token;

  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload: Record<string, string | number> = {
    iss: teamId,
    iat: now,
    exp: now + LIFETIME_SECONDS,
  };
  // Optional auf die eigene Adresse beschraenken, z. B. https://d2d-app.fly.dev
  const origin = process.env.APPLE_MAPKIT_ORIGIN?.trim();
  if (origin) payload.origin = origin;

  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.sign("sha256", Buffer.from(input), {
    key: privateKey(rawKey),
    dsaEncoding: "ieee-p1363",
  });
  const token = `${input}.${base64url(signature)}`;
  cached = { token, expires: now + LIFETIME_SECONDS };
  return token;
}

/**
 * Der .p8-Schluessel von Apple, so wie er in Umgebungsvariablen landet:
 * mit echten Zeilenumbruechen, mit "\n" oder nur als Base64-Block.
 */
function privateKey(raw: string): crypto.KeyObject {
  let pem = raw.trim().replace(/\\n/g, "\n");
  if (!pem.includes("BEGIN")) {
    const body = pem.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? "";
    pem = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
  }
  return crypto.createPrivateKey(pem);
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}
