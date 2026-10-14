import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { gzipSync } from "node:zlib";
import Pbf from "pbf";
import { StreetsError, loadStreets } from "../../src/lib/geo/fetch-streets";
import { streetsFromElements } from "../../src/lib/geo/osm-streets";
import type { Shape } from "../../src/lib/geo/shape";
import { searchStreets } from "../../src/lib/geo/street-search";
import { elementsFromTiles } from "../../src/lib/geo/tile-streets";

/*
 * Kartenkacheln als Rueckweg, wenn Overpass ueberlastet ist. Die Kacheln
 * werden hier selbst gebaut (Mapbox-Vector-Tile, OpenMapTiles-Ebenen), damit
 * der Test ohne Netz laeuft.
 */

const Z = 14;
const EXTENT = 4096;
const TILEJSON = "https://tiles.test/planet";
const TEMPLATE = "https://tiles.test/v1/{z}/{x}/{y}.pbf";

// Rund 500 m x 500 m in Kiel, samt Randstreifen ganz in der Kachel 14/8653/5234.
const area: Shape = [[[[54.3335, 10.1365], [54.3335, 10.1443], [54.338, 10.1443], [54.338, 10.1365]]]];

function tileXY(lat: number, lng: number): { x: number; y: number; px: number; py: number } {
  const n = 2 ** Z;
  const fx = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  return { x, y, px: Math.round((fx - x) * EXTENT), py: Math.round((fy - y) * EXTENT) };
}

const home = tileXY(54.3357, 10.1404);

interface Feature {
  type: 1 | 2;
  props: Record<string, string>;
  points: Array<[number, number]>; // [lat, lng]
}

/** Baut eine Kachel im MVT-Format mit den angegebenen Ebenen. */
function encodeTile(layers: Record<string, Feature[]>): Uint8Array {
  const pbf = new Pbf();
  for (const [name, features] of Object.entries(layers)) {
    const keys: string[] = [];
    const values: string[] = [];
    const index = (list: string[], value: string) => {
      const at = list.indexOf(value);
      if (at >= 0) return at;
      list.push(value);
      return list.length - 1;
    };
    const encoded = features.map((feature) => {
      const tags: number[] = [];
      for (const [key, value] of Object.entries(feature.props)) tags.push(index(keys, key), index(values, value));
      const local = feature.points.map(([lat, lng]) => {
        const t = tileXY(lat, lng);
        return [t.px + (t.x - home.x) * EXTENT, t.py + (t.y - home.y) * EXTENT];
      });
      const geometry: number[] = [];
      let cx = 0;
      let cy = 0;
      const zigzag = (n: number) => (n << 1) ^ (n >> 31);
      const command = (id: number, count: number) => (count << 3) | id;
      local.forEach(([px, py], i) => {
        if (i === 0) geometry.push(command(1, 1));
        if (i === 1) geometry.push(command(2, local.length - 1));
        geometry.push(zigzag(px - cx), zigzag(py - cy));
        cx = px;
        cy = py;
      });
      return { type: feature.type, tags, geometry };
    });
    pbf.writeMessage(3, (_: unknown, out: Pbf) => {
      out.writeVarintField(15, 2);
      out.writeStringField(1, name);
      for (const feature of encoded) {
        out.writeMessage(2, (__: unknown, f: Pbf) => {
          f.writePackedVarint(2, feature.tags);
          f.writeVarintField(3, feature.type);
          f.writePackedVarint(4, feature.geometry);
        }, null);
      }
      for (const key of keys) out.writeStringField(3, key);
      for (const value of values) out.writeMessage(4, (___: unknown, v: Pbf) => v.writeStringField(1, value), null);
      out.writeVarintField(5, EXTENT);
    }, null);
  }
  return pbf.finish();
}

const road = (name: string, kind: string, points: Array<[number, number]>, subclass = ""): Feature => ({
  type: 2,
  props: subclass ? { name, class: kind, subclass } : { name, class: kind },
  points,
});
const house = (number: string, lat: number, lng: number): Feature => ({
  type: 1,
  props: { housenumber: number },
  points: [[lat, lng]],
});

const kielTile = encodeTile({
  transportation_name: [
    // Waagerecht durch die Flaeche
    road("Herderstraße", "minor", [[54.3357, 10.13], [54.3357, 10.15]]),
    // Senkrecht durch die Flaeche
    road("Goethestraße", "tertiary", [[54.33, 10.1404], [54.341, 10.1404]]),
    // Ausserhalb - gehoert nicht in die Liste
    road("Fernweg", "minor", [[54.341, 10.131], [54.341, 10.133]]),
    // Autobahnen bekommen keine Hausnummern
    road("A 215", "motorway", [[54.3354, 10.13], [54.3354, 10.15]]),
  ],
  housenumber: [
    house("1", 54.3358, 10.137), // naeher an der Herderstraße
    house("3", 54.3358, 10.138),
    house("5;7", 54.3358, 10.1385),
    house("12", 54.3365, 10.1405), // naeher an der Goethestraße
    house("99", 54.341, 10.1404), // ausserhalb der Flaeche
  ],
});

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

function tiles(url: string, tile: Uint8Array = kielTile): Response | null {
  if (url === TILEJSON || url === "https://tiles.openfreemap.org/planet") {
    return json({ tiles: [TEMPLATE], maxzoom: 14 });
  }
  if (url.startsWith("https://tiles.test/v1/")) {
    return url === `https://tiles.test/v1/${Z}/${home.x}/${home.y}.pbf`
      ? new Response(tile as BodyInit)
      : new Response(null, { status: 404 });
  }
  return null;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("Kacheln: Straßen in der Fläche, Hausnummern an der nächsten Straße", async () => {
  mockFetch((url) => tiles(url) ?? json({}, 500));
  const { streets, addressCount } = streetsFromElements(await elementsFromTiles(area, { source: TILEJSON }), area);

  assert.deepEqual(
    streets.map((s) => s.name),
    ["Goethestraße", "Herderstraße"],
    "Fernweg liegt ausserhalb, die Autobahn bekommt keine Zeile",
  );
  const herder = streets.find((s) => s.name === "Herderstraße")!;
  assert.deepEqual(herder.numbers.map((n) => n.number), ["1", "3", "5", "7"]);
  assert.equal(herder.houseNumbers, "1-7");
  const goethe = streets.find((s) => s.name === "Goethestraße")!;
  assert.deepEqual(goethe.numbers.map((n) => n.number), ["12"]);
  assert.equal(addressCount, 4, "Nummer 99 liegt ausserhalb");
});

test("Kacheln: gepackte Kachel ohne Content-Encoding wird entpackt", async () => {
  mockFetch((url) => tiles(url, gzipSync(kielTile)) ?? json({}, 500));
  const { streets } = streetsFromElements(await elementsFromTiles(area, { source: TILEJSON }), area);
  assert.equal(streets.length, 2);
});

test("Kacheln: Straße ohne Ecke in der Fläche zählt, wenn sie die Fläche kreuzt", async () => {
  const crossing = encodeTile({
    transportation_name: [road("Querweg", "minor", [[54.333, 10.13], [54.339, 10.15]])],
    housenumber: [],
  });
  mockFetch((url) => tiles(url, crossing) ?? json({}, 500));
  const { streets } = streetsFromElements(await elementsFromTiles(area, { source: TILEJSON }), area);
  assert.deepEqual(streets.map((s) => s.name), ["Querweg"]);
  assert.ok(streets[0].lat !== null && streets[0].lng !== null);
});

test("ist Overpass ausgelastet, kommen die Straßen sofort aus den Kacheln", async () => {
  mockFetch((url) => tiles(url) ?? (url.includes("/api/interpreter") ? json({}, 429) : json({}, 500)));
  const result = await searchStreets(area, {
    overpassUrls: ["https://overpass.test/api/interpreter"],
    tileSource: TILEJSON,
  });
  assert.equal(result.source, "tiles");
  assert.deepEqual(result.streets.map((s) => s.name), ["Goethestraße", "Herderstraße"]);
});

test("schweigt Overpass, gelten nach dem Vorsprung die Kacheln - und Overpass wird abgebrochen", async () => {
  let aborted = false;
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const tile = tiles(url);
    if (tile) return tile;
    // Overpass antwortet nie - nur der Abbruch beendet die Anfrage.
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });
  }) as typeof fetch;

  const started = Date.now();
  const result = await searchStreets(area, {
    overpassUrls: ["https://overpass.test/api/interpreter"],
    tileSource: TILEJSON,
    headStartMs: 50,
  });
  assert.equal(result.source, "tiles");
  assert.ok(Date.now() - started < 2000, "kein Warten auf die Zeitlimits von Overpass");
  assert.ok(aborted, "die Overpass-Anfrage laeuft nicht weiter");
});

test("antwortet Overpass rechtzeitig, hat es Vorrang vor den Kacheln", async () => {
  mockFetch((url) => {
    const tile = tiles(url);
    if (tile) return tile;
    return json({
      elements: [
        { type: "node", id: 1, lat: 54.3358, lon: 10.137, tags: { "addr:housenumber": "2", "addr:street": "Herderstraße", "building:flats": "6" } },
      ],
    });
  });
  const result = await searchStreets(area, {
    overpassUrls: ["https://overpass.test/api/interpreter"],
    tileSource: TILEJSON,
  });
  assert.equal(result.source, "overpass");
  assert.deepEqual(result.streets.map((s) => s.name), ["Herderstraße"]);
  assert.equal(result.streets[0].units, 6);
});

test("leere Antwort von Overpass: die Kacheln dürfen trotzdem liefern", async () => {
  mockFetch((url) => tiles(url) ?? json({ elements: [] }));
  const result = await searchStreets(area, {
    overpassUrls: ["https://overpass.test/api/interpreter"],
    tileSource: TILEJSON,
  });
  assert.equal(result.source, "tiles");
  assert.equal(result.streets.length, 2);
});

test("Overpass leer und keine Kacheln: die Fläche ist eben leer - kein Fehler", async () => {
  mockFetch((url) => (url.includes("/api/interpreter") ? json({ elements: [] }) : new Response(null, { status: 503 })));
  const result = await searchStreets(area, {
    overpassUrls: ["https://overpass.test/api/interpreter"],
    tileSource: TILEJSON,
  });
  assert.equal(result.source, "overpass");
  assert.deepEqual(result.streets, []);
});

test("im Browser: Overpass gesperrt, Kacheln da - kein Umweg über den App-Server", async () => {
  mockFetch((url) => {
    if (url.includes("/api/interpreter")) return json({}, 429);
    if (url.includes("nominatim")) return json({ address: { city: "Kiel", postcode: "24105" } });
    // Die Standardquelle der App: OpenFreeMap
    if (url === "https://tiles.openfreemap.org/planet") return json({ tiles: [TEMPLATE], maxzoom: 14 });
    const tile = tiles(url);
    if (tile) return tile;
    throw new Error(`unerwartete Adresse ${url}`);
  });
  const result = await loadStreets(area);
  assert.equal(result.source, "tiles");
  assert.equal(result.place.city, "Kiel");
  assert.deepEqual(result.streets.map((s) => s.name), ["Goethestraße", "Herderstraße"]);
  assert.ok(!calls.includes("/api/geo/streets"));
});

test("im Browser: Overpass und Kacheln gescheitert - der App-Server springt ein", async () => {
  mockFetch((url) => {
    if (url.includes("/api/interpreter")) return json({}, 504);
    if (url.includes("nominatim")) return json({});
    if (url === "/api/geo/streets") {
      return json({ streets: [], addressCount: 0, areaSqKm: 0.2, place: { city: "", postalCode: "", district: "" } });
    }
    return new Response(null, { status: 503 });
  });
  const result = await loadStreets(area);
  assert.ok(calls.includes("/api/geo/streets"));
  assert.deepEqual(result.streets, []);
});

test("im Browser: alles gescheitert - verständliche Meldung statt Endlos-Laden", async () => {
  mockFetch((url) => {
    if (url === "/api/geo/streets") return json({ error: "Die Straßen-Server sind gerade alle ausgelastet." }, 400);
    return new Response(null, { status: 503 });
  });
  await assert.rejects(loadStreets(area), (error: unknown) => {
    assert.ok(error instanceof StreetsError);
    assert.match(error.message, /ausgelastet/);
    return true;
  });
});
