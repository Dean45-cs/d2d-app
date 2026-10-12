import type { LevelFeedback } from "./level-feedback";

/**
 * Warteschlange für Schreibvorgänge ohne Netz.
 *
 * Im Treppenhaus oder Keller ist regelmäßig kein Empfang. Statt eine
 * Fehlermeldung zu zeigen, landet der Eintrag im lokalen Speicher des Geräts
 * und wird automatisch nachgesendet, sobald wieder Verbindung besteht.
 *
 * Gepuffert werden Türeinträge und beschriebene Häuser (Haustyp und
 * Klingelschilder). Beide Endpunkte sind so gebaut, dass ein doppelt
 * gesendeter Aufruf nichts kaputt macht.
 *
 * Läuft ausschließlich im Browser.
 */

// Bewusst unverändert, damit wartende Einträge einen Deploy überleben.
const STORAGE_KEY = "d2d_pending_visits";

const DEFAULT_URL = "/api/visits";

export interface QueuedWrite {
  /** Nur lokal, um den Eintrag in der Liste wiederzufinden. */
  localId: string;
  createdAt: string;
  /** Anzeigetext für die Liste "wartet auf Verbindung" */
  label: string;
  payload: Record<string, unknown>;
  /** Zielroute. Altbestand ohne Angabe ging immer an /api/visits. */
  url?: string;
  /** Nur fürs Symbol in der Warteliste. */
  kind?: "visit" | "house";
  /** Neue Eintraege duerfen nach einem Kontowechsel nicht fremd verbucht werden. */
  ownerUserId?: number;
}

type Listener = (queue: QueuedWrite[]) => void;

const listeners = new Set<Listener>();

function read(): QueuedWrite[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedWrite[]) : [];
  } catch {
    // Privater Modus oder gesperrter Speicher: dann eben ohne Warteschlange.
    return [];
  }
}

function write(queue: QueuedWrite[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    return false;
  }
  listeners.forEach((listener) => listener(queue));
  return true;
}

export function getQueue(userId?: number): QueuedWrite[] {
  if (typeof window === "undefined") return [];
  return read().filter((entry) => entry.ownerUserId === undefined || entry.ownerUserId === userId);
}

export function subscribe(listener: Listener, userId?: number): () => void {
  const scoped: Listener = () => listener(getQueue(userId));
  listeners.add(scoped);
  return () => listeners.delete(scoped);
}

export function createVisitRequestId(): string {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  // getRandomValues funktioniert auch beim lokalen Zugriff ueber http://LAN-IP.
  return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), (value) =>
    value.toString(16).padStart(8, "0"),
  ).join("-");
}

export function enqueue(
  label: string,
  payload: Record<string, unknown>,
  target: { url?: string; kind?: QueuedWrite["kind"]; ownerUserId?: number } = {},
): QueuedWrite {
  const entry: QueuedWrite = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    label,
    payload,
    url: target.url ?? DEFAULT_URL,
    kind: target.kind ?? "visit",
    ownerUserId: target.ownerUserId,
  };
  if (entry.kind === "visit") entry.payload = {
    ...payload,
    clientRequestId: payload.clientRequestId ?? createVisitRequestId(),
    ...(target.ownerUserId === undefined ? {} : { ownerUserId: target.ownerUserId }),
  };
  if (!write([...read(), entry])) {
    throw new Error("Nicht gespeichert: Der Gerätespeicher ist voll oder gesperrt. Bitte mit Verbindung erneut versuchen.");
  }
  return entry;
}

export function remove(localId: string): boolean {
  return write(read().filter((item) => item.localId !== localId));
}

export interface FlushResult {
  sent: number;
  rejected: number;
  remaining: number;
  progression?: LevelFeedback;
}

let flushing = false;

/**
 * Sendet alle wartenden Einträge nach.
 *
 * Unterschieden wird bewusst:
 *  - Netzfehler  -> Eintrag bleibt in der Warteschlange, nächster Versuch später
 *  - 401/403/429 -> Anmeldung oder Wartezeit erforderlich, Eintrag bleibt liegen
 *  - andere 4xx -> Eintrag ist dauerhaft ungültig (z. B. Gebiet gelöscht) und
 *                   wird verworfen, sonst blockiert er die Schlange für immer
 *  - Antwort 5xx -> Serverproblem, Eintrag bleibt liegen
 */
export async function flush(userId?: number): Promise<FlushResult> {
  if (typeof window === "undefined" || flushing) {
    return { sent: 0, rejected: 0, remaining: getQueue(userId).length };
  }
  flushing = true;
  let sent = 0;
  let rejected = 0;
  let progression: LevelFeedback | undefined;

  try {
    for (const entry of getQueue(userId)) {
      try {
        // Auch Eintraege aus einer aelteren App-Version behalten beim Retry
        // dieselbe ID. Vor dem Senden speichern, sonst hilft es bei Abbruch nicht.
        if ((entry.url ?? DEFAULT_URL) === DEFAULT_URL && !entry.payload.clientRequestId) {
          entry.payload = { ...entry.payload, clientRequestId: `legacy-${entry.localId}` };
          if (!write(read().map((item) => item.localId === entry.localId ? entry : item))) break;
        }
        const response = await fetch(entry.url ?? DEFAULT_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(entry.payload),
        });
        if (response.ok) {
          // Die Bestaetigung vor dem Entfernen lesen: bei Verbindungsabbruch
          // bleibt die Anfrage wiederholbar und erzeugt serverseitig keine Duplikate.
          const data = await response.json();
          if (!remove(entry.localId)) break;
          if (data.progression) {
            const next = data.progression as LevelFeedback;
            progression = {
              ...next,
              awardedXp: (progression?.awardedXp ?? 0) + next.awardedXp,
              previousLevel: progression?.previousLevel ?? next.previousLevel,
              levelUp: Boolean(progression?.levelUp || next.levelUp),
            };
          }
          sent += 1;
        } else if (response.status === 401 || response.status === 403 || response.status === 429) {
          break; // Neu anmelden bzw. spaeter versuchen; keine Besuche verlieren.
        } else if (response.status >= 400 && response.status < 500) {
          if (!remove(entry.localId)) break;
          rejected += 1;
        } else {
          break; // Serverproblem: später nochmal, Reihenfolge bleibt erhalten
        }
      } catch {
        break; // weiterhin kein Netz
      }
    }
  } finally {
    flushing = false;
  }

  return { sent, rejected, remaining: getQueue(userId).length, progression };
}

/** Hängt sich an die Ereignisse, bei denen ein neuer Versuch sinnvoll ist. */
export function startAutoFlush(onFlushed: (result: FlushResult) => void, userId?: number): () => void {
  if (typeof window === "undefined") return () => {};

  const run = async () => {
    if (!navigator.onLine) return;
    if (getQueue(userId).length === 0) return;
    const result = await flush(userId);
    if (result.sent > 0 || result.rejected > 0) onFlushed(result);
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") void run();
  };

  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(run, 30_000);
  void run();

  return () => {
    window.removeEventListener("online", run);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
  };
}
