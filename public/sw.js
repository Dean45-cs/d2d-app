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
 *
 * Außerdem nimmt er Push-Nachrichten entgegen (Abschluss eines abonnierten
 * Kollegen, Kommentar auf einen eigenen Beitrag) und öffnet beim Antippen die
 * passende Seite. Versendet werden sie in src/lib/push.ts.
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

/* ------------------------------ Push-Nachrichten ------------------------- */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "EP24 Vertrieb", {
      body: data.body || "",
      icon: "/icon-192.png",
      tag: data.tag,
      // Nur relative Pfade der eigenen App - eine Nachricht fuehrt nie nach draussen.
      data: {
        url:
          typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//")
            ? data.url
            : "/feed",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/feed", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      // Ist die App schon offen, dorthin springen statt ein zweites Fenster zu oeffnen.
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        } catch {
          // Nicht steuerbar (etwa vor dem ersten Laden) - dann eben neu oeffnen.
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
