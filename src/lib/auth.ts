import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import type { Role, User } from "./types";

const COOKIE_NAME = "d2d_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 Tage - Aussendienst soll nicht taeglich neu einloggen

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET fehlt oder ist zu kurz. Bitte in .env.local setzen.",
      );
    }
    return "dev-only-insecure-secret-please-change";
  }
  return value;
}

/* ------------------------------ Passwoerter ------------------------------ */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/* -------------------------------- Session -------------------------------- */

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

/*
 * Das Token traegt den Sitzungsstand der Person (users.session_version).
 * Setzt die Teamleitung ein neues Passwort oder deaktiviert jemanden, zaehlt
 * der Stand hoch - alle bisherigen Anmeldungen (z. B. auf einem verlorenen
 * Handy) gelten dann nicht mehr. Aeltere Tokens ohne Stand zaehlen als 0.
 */
function createToken(userId: number, version: number): string {
  const payload = `${userId}.${version}.${Date.now() + MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string): { userId: number; version: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3 && parts.length !== 4) return null;
  const signature = parts.pop()!;
  const payload = parts.join(".");
  const expected = sign(payload);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  const [userId, version, expiresAt] = parts.length === 3 ? parts : [parts[0], "0", parts[1]];
  if (Number(expiresAt) < Date.now()) return null;
  return { userId: Number(userId), version: Number(version) };
}

export async function startSession(userId: number): Promise<void> {
  const store = await cookies();
  const row = getDb().prepare("SELECT session_version FROM users WHERE id = ?").get(userId) as
    | { session_version: number }
    | undefined;
  store.set(COOKIE_NAME, createToken(userId, row?.session_version ?? 0), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = readToken(token);
  if (!session) return null;
  const user = getDb()
    .prepare(
      `SELECT id, team_id, manager_id, name, email, role, phone, active,
              avatar_src(id, avatar) AS avatar, bio, created_at
         FROM users WHERE id = ? AND active = 1 AND session_version = ?`,
    )
    .get(session.userId, session.version) as User | undefined;
  return user ?? null;
}

/** Wirft, wenn niemand eingeloggt ist - fuer API-Routen und Server-Komponenten. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Nicht angemeldet", 401);
  return user;
}

export async function requireRole(role: Role): Promise<User> {
  const user = await requireUser();
  if (user.role !== role) throw new AuthError("Keine Berechtigung", 403);
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function authenticate(email: string, password: string): User | null {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE lower(email) = lower(?) AND active = 1")
    .get(email.trim()) as (User & { password_hash: string }) | undefined;
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  const { password_hash: _ignored, ...user } = row;
  void _ignored;
  return user;
}
