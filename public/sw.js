/*
 * Service Worker von Carlsson Sales.
 *
 * Zwischengespeichert werden unveränderliche Dateien (JavaScript, CSS,
 * Icons) und – damit die App auch im Funkloch startet – die zuletzt
 * geöffneten Seiten der angemeldeten Person. Diese Seiten enthalten Teamdaten,
 * darum gilt für sie:
 *  - Sie werden gelöscht, sobald die Anmeldeseite erscheint (Abmelden,
 *    abgelaufene Sitzung, Kontowechsel) und wenn die App „abgemeldet“ meldet.
 *  - Sie werden nur ohne Netz gezeigt, höchstens PAGE_MAX_AGE_MS alt und
 *    höchstens PAGE_LIMIT Stück.
 *  - Mit Netz kommt jede Seite frisch vom Server (Netz zuerst). Antwortet der
 *    Server bei schwachem Empfang nicht binnen NAV_TIMEOUT_MS, oder ist er
 *    gerade nicht erreichbar (502–504), erscheint die gespeicherte Seite –
 *    mit einem Hinweis auf ihren Stand (src/components/OfflineSupport.tsx).
 *
 * Die erfassten Türen werden NICHT hier gepuffert, sondern in der App selbst
 * (src/lib/offline-queue.ts) – so bleibt die Warteschlange sichtbar und
 * steuerbar.
 *
 * Außerdem nimmt er Push-Nachrichten entgegen (Abschluss eines abonnierten
 * Kollegen, Kommentar auf einen eigenen Beitrag) und öffnet beim Antippen die
 * passende Seite. Versendet werden sie in src/lib/push.ts.
 */

const VERSION = "v5";
const SHELL_CACHE = `d2d-shell-${VERSION}`;
const ASSET_CACHE = `d2d-assets-${VERSION}`;
// Name muss mit "d2d-pages-" beginnen - src/lib/offline-pages.ts loescht danach.
const PAGE_CACHE = `d2d-pages-${VERSION}`;

const SHELL_FILES = [
  "/offline.html",
  "/icon-192.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
];

/** So lange darf der Server bei einem Seitenaufruf schweigen, bevor die gespeicherte Seite kommt. */
const NAV_TIMEOUT_MS = 6000;
/** Aelter wird eine gespeicherte Seite nie gezeigt. */
const PAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 30;
/** Woran die App eine gespeicherte Seite erkennt (Name des meta-Tags). */
const COPY_MARK = "d2d-offline-copy";
/** "/" leitet nur weiter - ohne Netz geht es auf die zuletzt gespeicherte dieser Seiten. */
const HOME_PAGES = ["/tour", "/start"];

/*
 * Zaehlt jedes Loeschen der Seiten hoch. Eine Antwort, die waehrend des
 * Abmeldens noch unterwegs war, wird danach nicht mehr gespeichert.
 */
let pageGeneration = 0;

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
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE && key !== PAGE_CACHE)
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

/** Seiten der App, die ohne Netz wieder erscheinen duerfen. */
function isAppPage(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  if (path === "/" || path.startsWith("/api/") || path.startsWith("/_next/")) return false;
  if (path === "/login" || path.startsWith("/login/") || path.startsWith("/einladung")) return false;
  // Visitenkarten sind oeffentlich und zeigen den Stand des Abrufs - nie eine alte Kopie.
  if (path.startsWith("/k/")) return false;
  // Dateien (offline.html, sw.js, Icons) sind keine Seiten.
  return !/\.[a-z0-9]+$/i.test(path);
}

function isLoginPage(url) {
  return url.pathname === "/login" || url.pathname.startsWith("/login/");
}

/** Server oder Weg dorthin gerade nicht erreichbar - nicht die Seite selbst kaputt. */
function isOutage(status) {
  return status === 502 || status === 503 || status === 504;
}

function storable(response) {
  return (
    response.status === 200 &&
    !response.redirected &&
    (response.headers.get("content-type") || "").includes("text/html")
  );
}

async function clearPages() {
  pageGeneration += 1;
  await caches.delete(PAGE_CACHE);
}

/**
 * Seite fuer den Start ohne Netz ablegen. Sie bekommt ein meta-Tag mit dem
 * Zeitpunkt - daran erkennt die App, dass sie eine gespeicherte Seite zeigt.
 */
async function storePage(key, response, generation) {
  const html = await response.text();
  if (generation !== pageGeneration) return;
  const stamp = new Date().toISOString();
  let marked = false;
  const copy = html.replace(/<head(\s[^>]*)?>/i, (tag) => {
    marked = true;
    return `${tag}<meta name="${COPY_MARK}" content="${stamp}">`;
  });
  if (!marked) return;
  const cache = await caches.open(PAGE_CACHE);
  if (generation !== pageGeneration) return;
  // Loeschen und neu ablegen: die Reihenfolge der Eintraege ist die Reihenfolge der Nutzung.
  await cache.delete(key);
  await cache.put(
    key,
    new Response(copy, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "x-d2d-cached-at": stamp },
    }),
  );
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - PAGE_LIMIT)).map((old) => cache.delete(old)));
  await cacheAssetsOf(html);
}

/**
 * Die Skripte und Stile einer gespeicherten Seite mitnehmen - sonst stuende
 * sie ohne Netz zwar da, aber kein Knopf taete etwas.
 */
async function cacheAssetsOf(html) {
  // Im Seitenkopf stehen sie als "/_next/static/...", in den Daten fuer React teils ohne "/_next/".
  const found = html.match(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s)<>]+/g) || [];
  const urls = new Set(found.map((path) => (path.startsWith("/_next/") ? path : `/_next/${path}`)));
  if (urls.size === 0) return;
  const cache = await caches.open(ASSET_CACHE);
  for (const path of Array.from(urls).slice(0, 150)) {
    const url = new URL(path, self.location.origin).href;
    if (await cache.match(url)) continue;
    try {
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
    } catch {
      return; // Netz weg - beim naechsten Mal
    }
  }
}

async function findPage(url) {
  const cache = await caches.open(PAGE_CACHE);
  if (url.pathname === "/") {
    let best = null;
    for (const path of HOME_PAGES) {
      const hit = await cache.match(new URL(path, self.location.origin).href);
      const at = hit ? Date.parse(hit.headers.get("x-d2d-cached-at") || "") : NaN;
      if (fresh(at) && (!best || at > best.at)) best = { path, at };
    }
    return best ? Response.redirect(new URL(best.path, self.location.origin).href, 302) : null;
  }
  if (!isAppPage(url)) return null;
  // Erst genau diese Adresse, sonst dieselbe Seite mit anderen Suchparametern (?gebiet=...).
  const hit = (await cache.match(url.href)) || (await cache.match(url.href, { ignoreSearch: true }));
  if (!hit) return null;
  return fresh(Date.parse(hit.headers.get("x-d2d-cached-at") || "")) ? hit : null;
}

function fresh(at) {
  return Number.isFinite(at) && Date.now() - at < PAGE_MAX_AGE_MS;
}

async function offlinePage() {
  return (
    (await caches.match("/offline.html")) ??
    new Response("Offline", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    })
  );
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

/**
 * Seitenaufruf: Netz zuerst. Gibt es eine gespeicherte Seite, wartet die App
 * hoechstens NAV_TIMEOUT_MS darauf - ohne Netz gar nicht. Was spaeter noch
 * ankommt, wird trotzdem gespeichert.
 */
function navigate(request) {
  const url = new URL(request.url);
  const generation = pageGeneration;
  let settle = () => {};
  const done = new Promise((resolve) => {
    settle = resolve;
  });
  const network = fetch(request).then(
    (response) => {
      if (isLoginPage(url) && response.ok) settle(clearPages());
      else if (isAppPage(url) && storable(response)) settle(storePage(url.href, response.clone(), generation));
      else settle();
      return response;
    },
    (error) => {
      settle();
      throw error;
    },
  );
  // Ohne Netz kommt die gespeicherte Seite, ohne auf den Fehler zu warten.
  network.catch(() => undefined);

  const respond = async () => {
    const cached = await findPage(url).catch(() => null);
    if (!cached) {
      try {
        const response = await network;
        return isOutage(response.status) ? await offlinePage() : response;
      } catch {
        return offlinePage();
      }
    }
    if (self.navigator.onLine === false) return cached;
    try {
      const response = await Promise.race([network, timeout(NAV_TIMEOUT_MS)]);
      return isOutage(response.status) ? cached : response;
    } catch {
      return cached;
    }
  };

  return { response: respond(), done: done.catch(() => undefined) };
}

/**
 * Seiten im Hintergrund auffrischen (von der App angestossen, solange Netz da
 * ist): so ist auch nach Stunden ohne Neuladen ein aktueller Stand gespeichert.
 * Fuehrt der Aufruf zur Anmeldung, ist die Sitzung weg - dann alles loeschen.
 */
async function warmPages(paths) {
  for (const path of paths) {
    const url = new URL(path, self.location.origin);
    if (!isAppPage(url)) continue;
    const generation = pageGeneration;
    let response;
    try {
      response = await fetch(url.href, { credentials: "same-origin", cache: "no-store" });
    } catch {
      return; // kein Netz - beim naechsten Anstoss
    }
    if (response.redirected && isLoginPage(new URL(response.url))) {
      await clearPages();
      return;
    }
    if (storable(response)) await storePage(url.href, response, generation);
  }
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "clear-pages") {
    event.waitUntil(clearPages());
  } else if (data.type === "warm-pages" && Array.isArray(data.paths)) {
    const paths = data.paths
      .filter((path) => typeof path === "string" && path.startsWith("/") && !path.startsWith("//"))
      .slice(0, 5);
    event.waitUntil(warmPages(paths).catch(() => undefined));
  }
});

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

  // Seitenaufrufe: Netz zuerst, im Funkloch die gespeicherte Seite oder die Offline-Seite.
  if (request.mode === "navigate") {
    const { response, done } = navigate(request);
    event.respondWith(response);
    event.waitUntil(done);
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
    self.registration.showNotification(data.title || "Carlsson Sales", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: data.tag,
      // Nur relative Pfade der eigenen App - eine Nachricht fuehrt nie nach draussen.
      data: {
        url:
          typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//")
            ? data.url
            : "/team",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/team", self.location.origin).href;
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
