import { AuthError, changeOwnPassword, requireUser, startSession } from "@/lib/auth";
import { handle } from "@/lib/api";
import { loginThrottle, MAX_FAILURES_PER_ACCOUNT, retryText } from "@/lib/login-throttle";

export const dynamic = "force-dynamic";

/**
 * Das eigene Passwort aendern. Verlangt das bisherige - eine offene Sitzung
 * auf einem fremden Handy soll nicht reichen, um das Konto zu uebernehmen.
 */
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    const current = typeof body?.current === "string" ? body.current : "";
    const next = typeof body?.next === "string" ? body.next : "";
    if (!current || !next) throw new Error("Bitte das bisherige und das neue Passwort eingeben.");

    // Dieselbe Bremse wie beim Anmelden: das bisherige Passwort nicht durchprobieren lassen.
    const throttle = loginThrottle();
    const key = `password:${user.id}`;
    const wait = throttle.blockedFor(key, MAX_FAILURES_PER_ACCOUNT);
    if (wait > 0) throw new AuthError(`Zu viele Fehlversuche. Bitte ${retryText(wait)} erneut versuchen.`, 429);
    if (!changeOwnPassword(user.id, current, next)) {
      throttle.fail(key);
      throw new Error("Das bisherige Passwort stimmt nicht.");
    }
    throttle.reset(key);
    // Die anderen Geraete sind abgemeldet - dieses bleibt es mit dem neuen Stand.
    await startSession(user.id);
    return { ok: true };
  });
}
