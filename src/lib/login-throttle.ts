/**
 * Bremse gegen das Durchprobieren von Passwoertern.
 *
 * Gezaehlt werden nur Fehlversuche, und zwar je Kombination aus E-Mail und
 * Absender sowie je Absender allein. So sperrt niemand eine Kollegin aus,
 * nur weil er ihre E-Mail kennt - und wer viele Konten durchprobiert, faellt
 * trotzdem auf. Der Zaehler lebt im Speicher: die App laeuft auf genau einer
 * Maschine (SQLite), nach einem Neustart beginnt er von vorn.
 */

export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
/** Fehlversuche je E-Mail und Absender im Zeitfenster. */
export const MAX_FAILURES_PER_ACCOUNT = 8;
/** Fehlversuche je Absender im Zeitfenster - ein ganzes Team kann hinter einer Adresse stehen. */
export const MAX_FAILURES_PER_CLIENT = 40;
/** Obergrenze fuer gemerkte Schluessel, damit der Speicher nicht waechst. */
const MAX_KEYS = 10_000;

export class FailureThrottle {
  private failures = new Map<string, number[]>();

  constructor(
    private readonly windowMs = THROTTLE_WINDOW_MS,
    private readonly maxKeys = MAX_KEYS,
  ) {}

  /** Wie lange der Schluessel noch gesperrt ist (0 = frei). */
  blockedFor(key: string, limit: number, now = Date.now()): number {
    const recent = this.recent(key, now);
    if (recent.length < limit) return 0;
    // Frei, sobald der aelteste zaehlende Versuch aus dem Fenster faellt.
    return recent[recent.length - limit] + this.windowMs - now;
  }

  fail(key: string, now = Date.now()): void {
    const recent = this.recent(key, now);
    recent.push(now);
    this.failures.set(key, recent);
    if (this.failures.size > this.maxKeys) this.prune(now);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private recent(key: string, now: number): number[] {
    const list = this.failures.get(key);
    if (!list) return [];
    const kept = list.filter((at) => now - at < this.windowMs);
    if (kept.length === 0) this.failures.delete(key);
    else if (kept.length !== list.length) this.failures.set(key, kept);
    return kept;
  }

  private prune(now: number): void {
    for (const key of [...this.failures.keys()]) this.recent(key, now);
    // Immer noch zu viele: die aeltesten Schluessel gehen zuerst.
    const excess = this.failures.size - this.maxKeys;
    if (excess > 0) [...this.failures.keys()].slice(0, excess).forEach((key) => this.failures.delete(key));
  }
}

declare global {
  var __d2dLoginThrottle: FailureThrottle | undefined;
}

/** Ein Zaehler fuer den ganzen Server (auch ueber Neuladen im Entwicklungsmodus). */
export function loginThrottle(): FailureThrottle {
  globalThis.__d2dLoginThrottle ??= new FailureThrottle();
  return globalThis.__d2dLoginThrottle;
}

/**
 * Absender der Anfrage. Fly.io setzt Fly-Client-IP selbst; bei
 * X-Forwarded-For zaehlt der letzte Eintrag - den hat der eigene Proxy
 * angehaengt, die davor kann jeder mitschicken.
 */
export function clientAddress(headers: Headers): string {
  const fly = headers.get("fly-client-ip")?.trim();
  if (fly) return fly;
  const forwarded = headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  if (forwarded?.length) return forwarded[forwarded.length - 1];
  return headers.get("x-real-ip")?.trim() || "unbekannt";
}

/** "in 3 Minuten" - auf ganze Minuten aufgerundet, nie "in 0 Minuten". */
export function retryText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes === 1 ? "in einer Minute" : `in ${minutes} Minuten`;
}

export interface LoginAttempt {
  email: string;
  client: string;
}

function keys({ email, client }: LoginAttempt) {
  return { account: `login:${client}:${email.trim().toLowerCase()}`, client: `client:${client}` };
}

/** Wartezeit in ms, bevor dieser Absender es fuer diese E-Mail wieder versuchen darf. */
export function loginBlockedFor(attempt: LoginAttempt, throttle = loginThrottle(), now = Date.now()): number {
  const key = keys(attempt);
  return Math.max(
    throttle.blockedFor(key.account, MAX_FAILURES_PER_ACCOUNT, now),
    throttle.blockedFor(key.client, MAX_FAILURES_PER_CLIENT, now),
  );
}

export function recordLoginFailure(attempt: LoginAttempt, throttle = loginThrottle(), now = Date.now()): void {
  const key = keys(attempt);
  throttle.fail(key.account, now);
  throttle.fail(key.client, now);
}

/** Erfolgreich angemeldet: die Fehlversuche fuer dieses Konto sind vergessen. */
export function recordLoginSuccess(attempt: LoginAttempt, throttle = loginThrottle()): void {
  throttle.reset(keys(attempt).account);
}
