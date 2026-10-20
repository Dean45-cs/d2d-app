/**
 * Gespeicherte Seiten fuer den Start ohne Netz (public/sw.js legt sie ab).
 *
 * Sie enthalten Teamdaten. Darum werden sie beim Abmelden und auf der
 * Anmeldeseite geloescht - auf einem geteilten Geraet sieht der Naechste
 * nichts davon. Laeuft ausschliesslich im Browser.
 */

/** Wie der Service Worker seine Seitenablage benennt (d2d-pages-<Version>). */
const PAGE_CACHE_PREFIX = "d2d-pages-";
/** meta-Tag, das der Service Worker in jede gespeicherte Seite setzt. */
const COPY_MARK = "d2d-offline-copy";
const WARMED_KEY = "d2d_pages_warmed_at";
/** Seltener frischt die App die gespeicherten Seiten nicht auf - jede kostet einen ganzen Seitenaufruf. */
export const WARM_INTERVAL_MS = 5 * 60 * 1000;

/** Die Seiten, die man an der Tuer ohne Netz braucht: Klinken und Termine. */
export const FIELD_PAGES = ["/tour", "/termine"];

/** Alle gespeicherten Seiten loeschen - beim Abmelden und auf der Anmeldeseite. */
export async function clearOfflinePages(): Promise<void> {
  if (typeof window === "undefined") return;
  // Dem Service Worker Bescheid geben: eine Antwort, die noch unterwegs ist, wird nicht mehr gespeichert.
  navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" });
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(PAGE_CACHE_PREFIX)).map((key) => caches.delete(key)));
  } catch {
    // Ohne Cache-Speicher (http://LAN-IP, privater Modus) gibt es auch nichts zu loeschen.
  }
}

/**
 * Wann die angezeigte Seite gespeichert wurde - null, wenn sie frisch vom
 * Server kam. Der Service Worker zeigt eine gespeicherte Seite nur ohne Netz
 * oder wenn der Server nicht rechtzeitig antwortet.
 */
export function offlineCopyTime(doc: Pick<Document, "querySelector"> = document): Date | null {
  const value = doc.querySelector(`meta[name="${COPY_MARK}"]`)?.getAttribute("content");
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "14:32" fuer heute, sonst "Mo., 19.10., 14:32" - der Stand einer gespeicherten Seite. */
export function copyLabel(date: Date, now = new Date()): string {
  const time = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return time;
  const day = date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  return `${day}, ${time}`;
}

/** Das Merkmal entfernen, sobald frische Daten da sind. */
export function forgetOfflineCopy(): void {
  document.querySelectorAll(`meta[name="${COPY_MARK}"]`).forEach((node) => node.remove());
}

/**
 * Lohnt das Auffrischen gerade? Nur auf Handy und Tablet (dort faellt das
 * Netz weg), nicht im Datensparmodus und hoechstens alle WARM_INTERVAL_MS.
 */
export function shouldWarm(now = Date.now()): boolean {
  if (!navigator.onLine || !navigator.serviceWorker?.controller) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return false;
  const mobile =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(pointer: coarse)").matches;
  if (!mobile) return false;
  try {
    const last = Number(window.localStorage.getItem(WARMED_KEY) ?? 0);
    if (now - last < WARM_INTERVAL_MS) return false;
    window.localStorage.setItem(WARMED_KEY, String(now));
  } catch {
    // Ohne Speicher kein Merker - dann eben bei jedem Anstoss.
  }
  return true;
}

/** Den Service Worker bitten, diese Seiten im Hintergrund frisch zu speichern. */
export function warmOfflinePages(paths: string[] = FIELD_PAGES): void {
  if (typeof window === "undefined" || !shouldWarm()) return;
  navigator.serviceWorker.controller?.postMessage({ type: "warm-pages", paths });
}
