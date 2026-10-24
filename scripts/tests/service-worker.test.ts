import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";

/*
 * Der Service Worker (public/sw.js) in einer Sandbox: Cache-Speicher und Netz
 * sind nachgebaut, Zeitlimits laufen tausendfach schneller.
 */

const ORIGIN = "https://app.test";
const SOURCE = readFileSync(join(import.meta.dirname, "../../public/sw.js"), "utf8");

type Key = string | { url: string };
const keyOf = (key: Key) => new URL(typeof key === "string" ? key : key.url, ORIGIN).href;
const withoutSearch = (href: string) => href.split("?")[0];

class FakeCache {
  entries = new Map<string, Response>();
  async match(key: Key, options: { ignoreSearch?: boolean } = {}) {
    const href = keyOf(key);
    const hit =
      this.entries.get(href) ??
      (options.ignoreSearch
        ? [...this.entries].find(([stored]) => withoutSearch(stored) === withoutSearch(href))?.[1]
        : undefined);
    return hit?.clone();
  }
  async put(key: Key, response: Response) {
    this.entries.set(keyOf(key), response);
  }
  async delete(key: Key) {
    return this.entries.delete(keyOf(key));
  }
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }));
  }
  async addAll(keys: Key[]) {
    for (const key of keys) this.entries.set(keyOf(key), new Response("datei"));
  }
}

class FakeCaches {
  stores = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return this.stores.get(name)!;
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
  async match(key: Key) {
    for (const cache of this.stores.values()) {
      const hit = await cache.match(key);
      if (hit) return hit;
    }
    return undefined;
  }
  page(path: string) {
    const name = [...this.stores.keys()].find((key) => key.startsWith("d2d-pages-"));
    return name ? this.stores.get(name)!.entries.get(new URL(path, ORIGIN).href) : undefined;
  }
}

type Fetcher = (input: string | { url: string }, init?: RequestInit) => Promise<Response>;

function html(body: string) {
  return new Response(
    `<!DOCTYPE html><html lang="de"><head><meta charSet="utf-8"/><script src="/_next/static/chunks/main-abc.js" async=""></script></head><body>${body}<script>self.__next_f.push([1,"I[1,[\\"static/chunks/page-def.js\\"]]"])</script></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function boot(network: Fetcher) {
  const handlers = new Map<string, (event: unknown) => void>();
  const caches = new FakeCaches();
  const calls: string[] = [];
  const self = {
    location: new URL("/sw.js", ORIGIN),
    navigator: { onLine: true },
    addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  const fetch: Fetcher = (input, init) => {
    calls.push(typeof input === "string" ? input : input.url);
    return network(input, init);
  };
  vm.runInNewContext(SOURCE, {
    self,
    caches,
    fetch,
    Response,
    Headers,
    URL,
    console,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms / 1000),
  });

  /** wait: auch abwarten, was danach noch gespeichert wird (bei haengendem Netz nie fertig). */
  async function dispatch(type: string, data: Record<string, unknown>, wait = true) {
    let response: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    handlers.get(type)!({
      ...data,
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
      waitUntil: (value: Promise<unknown>) => pending.push(value),
    });
    const result = response ? await response : undefined;
    if (wait) await Promise.all(pending);
    return result;
  }

  return {
    caches,
    calls,
    self,
    navigate: (path: string, wait = true) =>
      dispatch("fetch", { request: { url: new URL(path, ORIGIN).href, method: "GET", mode: "navigate" } }, wait),
    message: (data: Record<string, unknown>) => dispatch("message", { data }),
  };
}

const offline: Fetcher = async () => {
  throw new TypeError("Load failed");
};

async function install(sw: ReturnType<typeof boot>) {
  await sw.caches.open("d2d-shell-v5").then((cache) =>
    cache.put("/offline.html", new Response("<h1>Keine Verbindung</h1>", { headers: { "content-type": "text/html" } })),
  );
}

test("an app page loaded online is kept with a marker and its scripts", async () => {
  let net: Fetcher = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    return url.includes("/_next/") ? new Response("js") : html("Klinken");
  };
  const sw = boot((input, init) => net(input, init));
  const response = await sw.navigate("/tour");
  assert.match(await response!.text(), /Klinken/);

  const copy = sw.caches.page("/tour");
  assert.ok(copy, "page stored");
  const text = await copy!.clone().text();
  assert.match(text, /<head><meta name="d2d-offline-copy" content="[^"]+">/);
  assert.ok(copy!.headers.get("x-d2d-cached-at"));
  // Seitenkopf und React-Daten: beide Skripte liegen bereit.
  const assets = await sw.caches.open("d2d-assets-v5");
  assert.ok(await assets.match("/_next/static/chunks/main-abc.js"));
  assert.ok(await assets.match("/_next/static/chunks/page-def.js"));

  net = offline;
  await install(sw);
  const again = await sw.navigate("/tour");
  assert.match(await again!.text(), /d2d-offline-copy[\s\S]*Klinken/);
});

test("without network: stored page, same page with other search, home redirect, else the offline page", async () => {
  let net: Fetcher = async () => html("Klinken");
  const sw = boot((input, init) => net(input, init));
  await sw.navigate("/tour");
  await install(sw);
  net = offline;

  assert.match(await (await sw.navigate("/tour?gebiet=4"))!.text(), /Klinken/);
  const home = await sw.navigate("/");
  assert.equal(home!.status, 302);
  assert.equal(home!.headers.get("location"), `${ORIGIN}/tour`);
  assert.match(await (await sw.navigate("/termine"))!.text(), /Keine Verbindung/);
});

test("the device says offline: the stored page comes without waiting for the network", async () => {
  let net: Fetcher = async () => html("Klinken");
  const sw = boot((input, init) => net(input, init));
  await sw.navigate("/tour");
  net = () => new Promise<Response>(() => {});
  sw.self.navigator.onLine = false;
  const started = Date.now();
  assert.match(await (await sw.navigate("/tour", false))!.text(), /Klinken/);
  assert.ok(Date.now() - started < 100);
});

test("a server that does not answer in time or is down (502-504) yields the stored page", async () => {
  let net: Fetcher = async () => html("Klinken");
  const sw = boot((input, init) => net(input, init));
  await sw.navigate("/tour");
  await install(sw);

  net = () => new Promise<Response>(() => {});
  assert.match(await (await sw.navigate("/tour", false))!.text(), /Klinken/);

  net = async () => new Response("Bad Gateway", { status: 502 });
  assert.match(await (await sw.navigate("/tour"))!.text(), /Klinken/);
  assert.match(await (await sw.navigate("/termine"))!.text(), /Keine Verbindung/);

  // Ein echter Fehler der Seite bleibt sichtbar - kein Ueberdecken mit altem Stand.
  net = async () => new Response("Fehler", { status: 500 });
  assert.equal((await sw.navigate("/tour"))!.status, 500);
});

test("login, invitations, business cards, API and redirects are never stored", async () => {
  const sw = boot(async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.endsWith("/weiter")) {
      const response = html("Ziel");
      Object.defineProperty(response, "redirected", { value: true });
      return response;
    }
    return html("Seite");
  });
  const paths = ["/login", "/einladung/abc", "/k/AbCdEfGhIjKl", "/offline.html", "/weiter"];
  for (const path of paths) await sw.navigate(path);
  for (const path of paths) assert.equal(sw.caches.page(path), undefined, path);
});

test("the login page wipes every stored page - also one still on its way", async () => {
  let release: (response: Response) => void = () => {};
  let net: Fetcher = async () => html("Klinken");
  const sw = boot((input, init) => net(input, init));
  await sw.navigate("/tour");
  assert.ok(sw.caches.page("/tour"));

  // Termine laden noch, als die Anmeldeseite kommt (Abmelden, Sitzung abgelaufen).
  net = () => new Promise<Response>((resolve) => (release = resolve));
  const slow = sw.navigate("/termine");
  net = async () => html("Anmelden");
  await sw.navigate("/login");
  release(html("Termine von Anna"));
  await slow;

  assert.equal(sw.caches.page("/tour"), undefined);
  assert.equal(sw.caches.page("/termine"), undefined);
});

test("pages older than a week are not shown", async () => {
  let net: Fetcher = async () => html("Klinken");
  const sw = boot((input, init) => net(input, init));
  await sw.navigate("/tour");
  await install(sw);
  const cache = await sw.caches.open("d2d-pages-v5");
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  await cache.put("/tour", new Response("alt", { headers: { "content-type": "text/html", "x-d2d-cached-at": old } }));
  net = offline;
  assert.match(await (await sw.navigate("/tour"))!.text(), /Keine Verbindung/);
  assert.match(await (await sw.navigate("/"))!.text(), /Keine Verbindung/);
});

test("warming stores the field pages; a redirect to the login wipes them", async () => {
  let loggedIn = true;
  const sw = boot(async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/_next/")) return new Response("js");
    if (!loggedIn) {
      const response = html("Anmelden");
      Object.defineProperty(response, "redirected", { value: true });
      Object.defineProperty(response, "url", { value: `${ORIGIN}/login` });
      return response;
    }
    return html(`Seite ${new URL(url).pathname}`);
  });

  await sw.message({ type: "warm-pages", paths: ["/tour", "/termine", "//fremd.example/x", "/api/visits"] });
  assert.match(await sw.caches.page("/tour")!.clone().text(), /Seite \/tour/);
  assert.ok(sw.caches.page("/termine"));
  assert.ok(!sw.calls.some((url) => url.includes("fremd") || url.includes("/api/")));

  loggedIn = false;
  await sw.message({ type: "warm-pages", paths: ["/tour"] });
  assert.equal(sw.caches.page("/termine"), undefined);
});

test("the app can wipe the stored pages (logout)", async () => {
  const sw = boot(async () => html("Klinken"));
  await sw.navigate("/tour");
  await sw.message({ type: "clear-pages" });
  assert.equal(sw.caches.page("/tour"), undefined);
});

test("at most 30 pages are kept, the least recently used go first", async () => {
  const sw = boot(async () => html("Seite"));
  await sw.navigate("/tour");
  for (let i = 0; i < 30; i += 1) await sw.navigate(`/team/beitrag/${i}`);
  assert.equal(sw.caches.page("/tour"), undefined);
  assert.ok(sw.caches.page("/team/beitrag/29"));
  const cache = await sw.caches.open("d2d-pages-v5");
  assert.equal((await cache.keys()).length, 30);
});
