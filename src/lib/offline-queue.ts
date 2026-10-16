import { bellKey } from "./doorbells";
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
  /**
   * Warum der Server den Eintrag gerade nicht annimmt (fehlende Berechtigung).
   * Er bleibt liegen, bis er verworfen wird - die Eintraege dahinter gehen weiter.
   */
  error?: string;
}

/**
 * Wie lange ein Aufruf an der Tuer hoechstens dauern darf. Bei schwachem
 * Empfang haengt eine Anfrage sonst minutenlang, und die Knoepfe bleiben
 * gesperrt. Danach wird gemerkt und nachgesendet - alle gepufferten Aufrufe
 * sind so gebaut, dass ein doppelter Eingang nichts doppelt verbucht.
 */
export const DOOR_TIMEOUT_MS = 8000;

/** fetch mit Zeitlimit - eine abgebrochene Anfrage wirft wie ein Netzfehler. */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = DOOR_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type Listener = (queue: QueuedWrite[]) => void;

const listeners = new Set<Listener>();

/** Wer wissen muss, dass Eintraege nie beim Server ankommen (verworfen oder abgelehnt). */
const droppedListeners = new Set<(entries: QueuedWrite[]) => void>();

export function onDropped(listener: (entries: QueuedWrite[]) => void): () => void {
  droppedListeners.add(listener);
  return () => droppedListeners.delete(listener);
}

function announceDropped(entries: QueuedWrite[]): void {
  if (entries.length > 0) droppedListeners.forEach((listener) => listener(entries));
}

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

/** Von Hand verwerfen: der Eintrag kommt nie beim Server an - die Anzeige nimmt ihn zurueck. */
export function discard(localId: string): boolean {
  const entry = read().find((item) => item.localId === localId);
  if (!remove(localId)) return false;
  if (entry) announceDropped([entry]);
  return true;
}

/**
 * Eine Klingel, die nur auf dem Geraet existiert, wieder entfernen: auch aus
 * den wartenden Haus-Eintraegen. Sonst legte das Nachsenden das vertippte
 * Schild spaeter doch noch an - und das Haus waere nie fertig.
 */
export function forgetQueuedBell(userId: number, streetId: number, houseNumber: string, label: string): void {
  const same = (value: unknown) =>
    String(value ?? "").replace(/\s+/g, "").toLowerCase() === houseNumber.replace(/\s+/g, "").toLowerCase();
  const key = bellKey(label);
  let changed = false;
  const next = read().map((entry) => {
    const payload = entry.payload;
    if (
      entry.url !== "/api/houses" ||
      (entry.ownerUserId !== undefined && entry.ownerUserId !== userId) ||
      payload.streetId !== streetId ||
      !same(payload.houseNumber) ||
      !Array.isArray(payload.doorbells)
    ) {
      return entry;
    }
    const doorbells = (payload.doorbells as Array<{ label?: unknown }>).filter(
      (bell) => bellKey(String(bell?.label ?? "")) !== key,
    );
    if (doorbells.length === payload.doorbells.length) return entry;
    changed = true;
    return { ...entry, payload: { ...payload, doorbells } };
  });
  if (changed) write(next);
}

export interface FlushResult {
  sent: number;
  rejected: number;
  /** Neu zurueckgehalten: der Server nimmt sie nicht an, sie bleiben zum Verwerfen liegen. */
  held: number;
  remaining: number;
  progression?: LevelFeedback;
}

let flushing = false;

/**
 * Sendet alle wartenden Einträge nach.
 *
 * Unterschieden wird bewusst:
 *  - Netzfehler  -> Eintrag bleibt in der Warteschlange, nächster Versuch später
 *  - 401/429     -> Anmeldung oder Wartezeit erforderlich, Eintrag bleibt liegen
 *  - 403         -> keine Berechtigung (etwa: Gebiet inzwischen übergeben). Der
 *                   Eintrag bleibt mit Grund sichtbar liegen, die Einträge
 *                   dahinter gehen trotzdem raus - sonst stünde alles still
 *  - andere 4xx -> Eintrag ist dauerhaft ungültig (z. B. Gebiet gelöscht) und
 *                   wird verworfen, sonst blockiert er die Schlange für immer
 *  - Antwort 5xx -> Serverproblem, Eintrag bleibt liegen
 */
export async function flush(userId?: number): Promise<FlushResult> {
  if (typeof window === "undefined" || flushing) {
    return { sent: 0, rejected: 0, held: 0, remaining: getQueue(userId).length };
  }
  flushing = true;
  let sent = 0;
  let rejected = 0;
  let held = 0;
  let progression: LevelFeedback | undefined;

  /*
   * Auftraege, deren Eroeffnung (OPEN) noch nicht angekommen ist: die
   * Entscheidung dazu (Abschluss, Abbruch) wartet mit. Der Server kennt den
   * Auftrag sonst nicht und lehnt ab - und ein bestaetigter Abschluss waere weg.
   */
  const waitingDrafts = new Set<string>();
  const draftKeyOf = (entry: QueuedWrite) =>
    entry.url === "/api/sale-drafts" && typeof entry.payload.draftKey === "string" ? entry.payload.draftKey : null;

  try {
    for (const entry of getQueue(userId)) {
      const draftKey = draftKeyOf(entry);
      if (draftKey && entry.payload.action !== "OPEN" && waitingDrafts.has(draftKey)) {
        const error = "Wartet, bis der Auftrag selbst gespeichert ist";
        if (entry.error !== error) {
          if (!write(read().map((item) => (item.localId === entry.localId ? { ...item, error } : item)))) break;
          held += 1;
        }
        continue;
      }
      try {
        // Auch Eintraege aus einer aelteren App-Version behalten beim Retry
        // dieselbe ID. Vor dem Senden speichern, sonst hilft es bei Abbruch nicht.
        if ((entry.url ?? DEFAULT_URL) === DEFAULT_URL && !entry.payload.clientRequestId) {
          entry.payload = { ...entry.payload, clientRequestId: `legacy-${entry.localId}` };
          if (!write(read().map((item) => item.localId === entry.localId ? entry : item))) break;
        }
        // Besuche und Auftraege zaehlen fuer den Moment an der Tuer, nicht fuers Nachsenden.
        const body = entry.kind === "house" ? entry.payload : { recordedAt: entry.createdAt, ...entry.payload };
        const response = await fetchWithTimeout(entry.url ?? DEFAULT_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
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
        } else if (response.status === 401 || response.status === 429) {
          break; // Neu anmelden bzw. spaeter versuchen; keine Besuche verlieren.
        } else if (response.status === 403) {
          // Liegen lassen, Grund merken - und mit dem naechsten weitermachen.
          const data = await response.json().catch(() => ({}));
          const error = typeof data.error === "string" && data.error ? data.error : "Keine Berechtigung";
          if (draftKey) waitingDrafts.add(draftKey);
          if (entry.error !== error) {
            if (!write(read().map((item) => (item.localId === entry.localId ? { ...item, error } : item)))) break;
            held += 1;
          }
        } else if (response.status >= 400 && response.status < 500) {
          if (!remove(entry.localId)) break;
          announceDropped([entry]);
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

  return { sent, rejected, held, remaining: getQueue(userId).length, progression };
}

/** Hängt sich an die Ereignisse, bei denen ein neuer Versuch sinnvoll ist. */
export function startAutoFlush(onFlushed: (result: FlushResult) => void, userId?: number): () => void {
  if (typeof window === "undefined") return () => {};

  const run = async () => {
    if (!navigator.onLine) return;
    if (getQueue(userId).length === 0) return;
    const result = await flush(userId);
    if (result.sent > 0 || result.rejected > 0 || result.held > 0) onFlushed(result);
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
