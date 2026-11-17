import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { compareTariffOptions } from "../../src/lib/tariff-options";
import { comparePlace, coversKwh } from "../../src/lib/tariff-compare";
import { navigation } from "../../src/lib/nav";
import { permissionsFor } from "../../src/lib/permissions";
import type { ProviderInfo } from "../../src/lib/energy/provider";
import type { User } from "../../src/lib/types";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-tariff-options-"));
const previous = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = path.join(directory, "test.db");
const db = getDb();
after(() => {
  db.close(); global.__d2dDb = undefined;
  if (previous === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previous;
  rmSync(directory, { recursive: true, force: true });
});

test("Tarife für den Vergleich: nur Namen und Staffeln, keine Provisionen", () => {
  const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Vergleich')").run().lastInsertRowid);
  const tariff = db.prepare("INSERT INTO commission_tariffs(team_id, provider, name, sparte, segment, active, hidden) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const band = db.prepare("INSERT INTO commission_bands(tariff_id, kwh_from, kwh_to, base_eur, promo_eur) VALUES (?, ?, ?, 184.62, 20)");
  const basic = Number(tariff.run(team, "E wie Einfach", "Strom Basic", "STROM", "PRIVAT", 1, 0).lastInsertRowid);
  band.run(basic, 0, 2999);
  band.run(basic, 3000, 10000);
  band.run(Number(tariff.run(team, "Goldgas", "Gas spar24", "GAS", "GEWERBE", 1, 0).lastInsertRowid), 0, 100000);
  tariff.run(team, "Alt", "Entfallen", "STROM", "PRIVAT", 0, 0);
  tariff.run(team, "Versteckt", "Ausgeblendet", "STROM", "PRIVAT", 1, 1);
  tariff.run(team, "Sonst", "Wärmepumpe", "SONSTIGES", "PRIVAT", 1, 0);

  const options = compareTariffOptions(team);
  assert.deepEqual(options.map((o) => o.name), ["Strom Basic", "Gas spar24"]);
  assert.deepEqual(options[0].ranges, [[0, 2999], [3000, 10000]]);
  assert.equal(options[1].business, true);
  // Was in den Browser geht, kennt keinen Euro-Betrag.
  assert.ok(!JSON.stringify(options).includes("184.62"));
  assert.deepEqual(Object.keys(options[0]).sort(), ["business", "id", "name", "provider", "ranges", "sparte"]);

  assert.equal(coversKwh(options[0], 2000), true);
  assert.equal(coversKwh(options[0], 20000), false);
  assert.equal(coversKwh(options[0], null), true);
});

test("Grundversorger als aktueller Vertrag - nur für den eigenen Ort", () => {
  const info: ProviderInfo = {
    provider: "Stadtwerke Kiel",
    gasProvider: "",
    city: "Kiel",
    plz: "24103",
    match: "plz",
    distanceKm: null,
    manual: true,
    validFrom: "",
    sourceUrl: "",
    stale: false,
    strom: { ct: 36.57, base: 120.6, year: 1400, step: 2, delta: 0 },
    gas: null,
  };
  const place = comparePlace(info, "Nord");
  assert.deepEqual(place?.price.STROM, { ct: 36.57, baseYear: 120.6 });
  assert.equal(place?.price.GAS, null);
  assert.equal(place?.provider.GAS, "Stadtwerke Kiel");
  // Preis eines Nachbarorts: dort kann ein anderer Versorger liefern - nicht vorbelegen.
  assert.equal(comparePlace({ ...info, match: "nearby", distanceKm: 12 }, "Nord"), null);
  assert.equal(comparePlace(null, "Nord"), null);
});

test("Tarifvergleich steht allen in der Navigation", () => {
  const member = { id: 1, team_id: 1, role: "MEMBER", tier: "BERATER", active: 1 } as unknown as User;
  const nav = navigation("MEMBER", permissionsFor(member));
  assert.ok(nav.items.some((item) => item.href === "/tarifvergleich" && item.icon === "calculator"));
  assert.ok(nav.sidebar[0].items.some((item) => item.href === "/tarifvergleich"));
  // Auf dem Handy gehoert die Seite zum Reiter "Profil".
  assert.ok(nav.tabs.find((tab) => tab.href === "/profil")?.match?.includes("/tarifvergleich"));
});
