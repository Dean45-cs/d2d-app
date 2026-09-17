/*
 * Service Worker der D2D-App.
 *
 * Bewusst zurückhaltend: Es werden nur unveränderliche Dateien
 * (JavaScript, CSS, Icons) zwischengespeichert – niemals HTML-Seiten mit
 * Teamdaten. Sonst könnte auf einem geteilten Gerät nach dem Abmelden noch
 * eine gecachte Seite auftauchen.
 *
 * Die erfassten Türen werden NICHT hier gepuffert, sondern in der App selbst
 * (src/lib/offline-queue.ts) – so bleibt die Warteschlange sichtbar und
 * steuerbar.
 */

const VERSION = "v1";
const SHELL_CACHE = `d2d-shell-${VERSION}`;
const ASSET_CACHE = `d2d-assets-${VERSION}`;

const SHELL_FILES = [
  "/offline.html",
  "/icon-192.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(png|svg|ico|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API-Antworten nie zwischenspeichern – sie enthalten Teamdaten.
  if (url.pathname.startsWith("/api/")) return;

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Seitenaufrufe: immer aus dem Netz, bei Funkloch die Offline-Seite.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html").then(
          (cached) =>
            cached ??
            new Response("Offline", {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            }),
        ),
      ),
    );
  }
});
