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

function write(queue: QueuedWrite[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Speicher voll oder gesperrt – der Eintrag geht dann leider verloren,
    // der Aufrufer zeigt in dem Fall eine Fehlermeldung.
  }
  listeners.forEach((listener) => listener(queue));
}

export function getQueue(): QueuedWrite[] {
  if (typeof window === "undefined") return [];
  return read();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function enqueue(
  label: string,
  payload: Record<string, unknown>,
  target: { url?: string; kind?: QueuedWrite["kind"] } = {},
): QueuedWrite {
  const entry: QueuedWrite = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    label,
    payload,
    url: target.url ?? DEFAULT_URL,
    kind: target.kind ?? "visit",
  };
  write([...read(), entry]);
  return entry;
}

export function remove(localId: string): void {
  write(read().filter((item) => item.localId !== localId));
}

export interface FlushResult {
  sent: number;
  rejected: number;
  remaining: number;
}

let flushing = false;

/**
 * Sendet alle wartenden Einträge nach.
 *
 * Unterschieden wird bewusst:
 *  - Netzfehler  -> Eintrag bleibt in der Warteschlange, nächster Versuch später
 *  - Antwort 4xx -> Eintrag ist dauerhaft ungültig (z. B. Gebiet gelöscht) und
 *                   wird verworfen, sonst blockiert er die Schlange für immer
 *  - Antwort 5xx -> Serverproblem, Eintrag bleibt liegen
 */
export async function flush(): Promise<FlushResult> {
  if (typeof window === "undefined" || flushing) {
    return { sent: 0, rejected: 0, remaining: getQueue().length };
  }
  flushing = true;
  let sent = 0;
  let rejected = 0;

  try {
    for (const entry of read()) {
      try {
        const response = await fetch(entry.url ?? DEFAULT_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(entry.payload),
        });
        if (response.ok) {
          remove(entry.localId);
          sent += 1;
        } else if (response.status >= 400 && response.status < 500) {
          remove(entry.localId);
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

  return { sent, rejected, remaining: read().length };
}

/** Hängt sich an die Ereignisse, bei denen ein neuer Versuch sinnvoll ist. */
export function startAutoFlush(onFlushed: (result: FlushResult) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const run = async () => {
    if (!navigator.onLine) return;
    if (getQueue().length === 0) return;
    const result = await flush();
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
