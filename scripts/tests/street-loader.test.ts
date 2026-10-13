import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { StreetsError, loadStreets } from "../../src/lib/geo/fetch-streets";
import type { Shape } from "../../src/lib/geo/shape";

// Rund 1 km² in Dortmund.
const area: Shape = [[[[51.51, 7.46], [51.51, 7.475], [51.519, 7.475], [51.519, 7.46]]]];

const overpassAnswer = {
  elements: [
    { type: "way", id: 1, center: { lat: 51.515, lon: 7.465 }, tags: { highway: "residential", name: "Gartenweg" } },
    { type: "node", id: 2, lat: 51.515, lon: 7.466, tags: { "addr:housenumber": "3", "addr:street": "Gartenweg" } },
  ],
};
const serverAnswer = {
  streets: [{ name: "Vom Server", houseNumbers: "", units: 0, addresses: 0, lat: null, lng: null, numbers: [] }],
  addressCount: 0,
  areaSqKm: 1,
  place: { city: "Dortmund", postalCode: "44135", district: "" },
};

type Handler = (url: string) => Response | Promise<Response>;
const realFetch = globalThis.fetch;
let calls: string[] = [];

function mockFetch(handler: Handler) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function answer(url: string, overpass: () => Response, server: () => Response): Response {
  if (url.includes("/api/interpreter")) return overpass();
  if (url.includes("nominatim")) return json({ address: { city: "Dortmund", postcode: "44135", suburb: "Mitte" } });
  if (url === "/api/geo/streets") return server();
  throw new Error(`unerwartete Adresse ${url}`);
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("Straßen kommen direkt von Overpass, ohne den App-Server", async () => {
  mockFetch((url) => answer(url, () => json(overpassAnswer), () => json({}, 500)));
  const result = await loadStreets(area);
  assert.deepEqual(result.streets.map((s) => s.name), ["Gartenweg"]);
  assert.equal(result.place.postalCode, "44135");
  assert.ok(!calls.includes("/api/geo/streets"));
});

test("sperrt Overpass das Gerät aus, springt der App-Server ein", async () => {
  mockFetch((url) => answer(url, () => json({}, 429), () => json(serverAnswer)));
  const result = await loadStreets(area);
  assert.deepEqual(result.streets.map((s) => s.name), ["Vom Server"]);
  assert.ok(calls.includes("/api/geo/streets"));
});

test("Overpass meldet 'runtime error' mit Status 200 - zählt als Fehler", async () => {
  mockFetch((url) =>
    answer(url, () => json({ elements: [], remark: "runtime error: Query timed out" }), () => json(serverAnswer)),
  );
  const result = await loadStreets(area);
  assert.deepEqual(result.streets.map((s) => s.name), ["Vom Server"]);
});

test("scheitern beide Wege, kommt die Meldung des Servers an", async () => {
  mockFetch((url) =>
    answer(url, () => json({}, 504), () => json({ error: "Die Straßen-Server sind gerade alle ausgelastet." }, 400)),
  );
  await assert.rejects(loadStreets(area), (error: unknown) => {
    assert.ok(error instanceof StreetsError);
    assert.match(error.message, /ausgelastet/);
    return true;
  });
});

test("eine abgelehnte Abfrage geht nicht noch einmal über den Server", async () => {
  mockFetch((url) => answer(url, () => new Response("bad query", { status: 400 }), () => json(serverAnswer)));
  await assert.rejects(loadStreets(area), StreetsError);
  assert.ok(!calls.includes("/api/geo/streets"));
});

test("zu große Flächen werden gar nicht erst abgefragt", async () => {
  mockFetch(() => json(overpassAnswer));
  const huge: Shape = [[[[51.0, 7.0], [51.0, 7.5], [51.4, 7.5], [51.4, 7.0]]]];
  await assert.rejects(loadStreets(huge), /zu groß/);
  assert.equal(calls.length, 0);
});
