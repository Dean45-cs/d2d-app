import assert from "node:assert/strict";
import { test } from "node:test";
import {
  annualCost,
  breakEven,
  breakEvenText,
  compareTariffs,
  convertBase,
  eur,
  headline,
  readKwh,
  readNumber,
  readPrice,
  tariffCost,
  type TariffPrice,
} from "../../src/lib/tariff-compare";
import { findPrice, loadDraft, MAX_REMEMBERED, recentPrices, rememberPrices, saveDraft } from "../../src/lib/tariff-memory";

// Kontrollwerte aus der Vorgabe: 2.000 kWh, 2 Jahre.
const KIEL: TariffPrice = { baseYear: 120.6, ct: 36.57, bonus: 0 };
const E_WIE_EINFACH: TariffPrice = { baseYear: 0, ct: 41.87, bonus: 80 };
const OSTROM: TariffPrice = { baseYear: 194.71, ct: 33.53, bonus: 100 };

test("Jahreskosten = Grundpreis + Verbrauch × Arbeitspreis / 100", () => {
  assert.equal(annualCost(KIEL, 2000), 852);
  assert.equal(annualCost(E_WIE_EINFACH, 2000), 837.4);
  assert.equal(annualCost(OSTROM, 2000), 865.31);
});

test("Kontrollwerte: Stadtwerke Kiel, E wie Einfach, OStrom über 2 Jahre", () => {
  assert.equal(tariffCost(KIEL, 2000, 2).total, 1704);
  assert.equal(tariffCost(E_WIE_EINFACH, 2000, 2).total, 1594.8);
  assert.equal(tariffCost(OSTROM, 2000, 2).total, 1630.62);

  const result = compareTariffs(2000, 2, KIEL, [
    { price: OSTROM, meta: "OStrom" },
    { price: E_WIE_EINFACH, meta: "E wie Einfach" },
  ]);
  assert.equal(result.current.total, 1704);
  // Sortiert nach Gesamtkosten: E wie Einfach vor OStrom, obwohl OStrom zuerst eingetragen wurde.
  assert.deepEqual(result.offers.map((offer) => [offer.rank, offer.meta, offer.cost.total, offer.saving]), [
    [1, "E wie Einfach", 1594.8, 109.2],
    [2, "OStrom", 1630.62, 73.38],
  ]);
  assert.equal(result.best?.meta, "E wie Einfach");
});

test("Break-even: E wie Einfach günstiger bis ca. 3.030 kWh, OStrom ab ca. 793 kWh", () => {
  const eWie = breakEven(KIEL, E_WIE_EINFACH, 2);
  assert.equal(eWie.kind, "upTo");
  assert.ok(eWie.kind === "upTo" && Math.abs(eWie.kwh - 3030.19) < 0.01);
  assert.equal(breakEvenText(eWie), "günstiger bis ca. 3.030 kWh");

  const oStrom = breakEven(KIEL, OSTROM, 2);
  assert.equal(oStrom.kind, "from");
  assert.ok(oStrom.kind === "from" && Math.abs(oStrom.kwh - 793.09) < 0.01);
  assert.equal(breakEvenText(oStrom), "günstiger ab ca. 793 kWh");

  // Am Break-even kosten beide über den Zeitraum gleich viel.
  if (eWie.kind === "upTo") {
    const at = eWie.kwh;
    assert.ok(Math.abs(2 * (120.6 + (at * 36.57) / 100) - (2 * ((at * 41.87) / 100) - 80)) < 1e-6);
  }
});

test("1. Jahr, Folgejahr und Abschlag: der Bonus zählt nur einmal", () => {
  const cost = tariffCost(E_WIE_EINFACH, 2000, 2);
  assert.equal(cost.firstYear, 757.4);
  assert.equal(cost.followYear, 837.4);
  assert.equal(cost.monthly, 69.78);

  const [offer] = compareTariffs(2000, 2, KIEL, [{ price: E_WIE_EINFACH, meta: null }]).offers;
  assert.equal(offer.savingFirstYear, 94.6);
  assert.equal(offer.savingFollowYear, 14.6);
  assert.equal(offer.saving, 109.2);

  // Das Beispiel aus der Praxis: bei 3.500 kWh spart E wie Einfach im 1. Jahr (Bonus),
  // ist ab dem 2. Jahr aber teurer als der Grundversorger - über 2 Jahre ein Verlust.
  const [heavy] = compareTariffs(3500, 2, KIEL, [{ price: E_WIE_EINFACH, meta: null }]).offers;
  assert.equal(heavy.savingFirstYear, 15.1);
  assert.equal(heavy.savingFollowYear, -64.9);
  assert.equal(heavy.saving, -49.8);
  // Ein Jahr lang betrachtet sähe er günstiger aus - genau das zeigen Portale.
  assert.equal(compareTariffs(3500, 1, KIEL, [{ price: E_WIE_EINFACH, meta: null }]).offers[0].saving, 15.1);
});

test("Break-even-Grenzfälle: gleicher Arbeitspreis, nie, immer", () => {
  assert.deepEqual(breakEven(KIEL, { baseYear: 100, ct: 36.57, bonus: 0 }, 2), { kind: "always" });
  assert.deepEqual(breakEven(KIEL, { baseYear: 130, ct: 36.57, bonus: 0 }, 2), { kind: "never" });
  assert.deepEqual(breakEven(KIEL, { ...KIEL }, 2), { kind: "never" });
  // Höherer Arbeitspreis und höherer Grundpreis: nie günstiger.
  assert.deepEqual(breakEven(KIEL, { baseYear: 150, ct: 40, bonus: 0 }, 2), { kind: "never" });
  // Niedrigerer Arbeitspreis und niedrigerer Grundpreis: immer günstiger.
  assert.deepEqual(breakEven(KIEL, { baseYear: 100, ct: 30, bonus: 0 }, 2), { kind: "always" });
  // Bonus des aktuellen Vertrags geht mit ein.
  const withOldBonus = breakEven({ ...KIEL, bonus: 50 }, E_WIE_EINFACH, 2);
  assert.ok(withOldBonus.kind === "upTo" && Math.abs(withOldBonus.kwh - (2 * 120.6 + 80 - 50) / ((2 * 5.3) / 100)) < 1e-6);
});

test("Gas rechnet mit derselben Logik", () => {
  const grundversorger: TariffPrice = { baseYear: 180, ct: 13.6, bonus: 0 };
  const angebot: TariffPrice = { baseYear: 150, ct: 11.2, bonus: 120 };
  const result = compareTariffs(15000, 2, grundversorger, [{ price: angebot, meta: "Gas" }]);
  assert.equal(result.current.total, 2 * (180 + 2040));
  assert.equal(result.offers[0].cost.total, 2 * (150 + 1680) - 120);
  assert.equal(result.offers[0].saving, 4440 - 3540);
  assert.equal(result.offers[0].breakEven.kind, "always");
});

test("Eingaben: Komma, Punkt, Tausender und Grundpreis pro Monat", () => {
  assert.equal(readNumber("36,57"), 36.57);
  assert.equal(readNumber("120.60"), 120.6);
  assert.equal(readNumber("1.234,50"), 1234.5);
  assert.equal(readNumber(""), null);
  assert.ok(Number.isNaN(readNumber("abc") as number));
  assert.equal(readKwh("2.000"), 2000);
  assert.equal(readKwh("3500 kWh"), 3500);
  assert.equal(readKwh("0"), null);

  const monthly = readPrice({ base: "10,05", ct: "36,57", bonus: "" }, "month", "STROM");
  assert.deepEqual(monthly, { ok: true, price: { baseYear: 120.6, ct: 36.57, bonus: 0 } });
  const yearly = readPrice({ base: "120,60", ct: "36,57", bonus: "" }, "year", "STROM");
  assert.deepEqual(yearly, { ok: true, price: { baseYear: 120.6, ct: 36.57, bonus: 0 } });
  // Ohne Grundpreis: 0 € (E wie Einfach), ohne Arbeitspreis: noch nicht fertig.
  assert.deepEqual(readPrice({ base: "", ct: "41,87", bonus: "80" }, "year", "STROM"), {
    ok: true,
    price: { baseYear: 0, ct: 41.87, bonus: 80 },
  });
  assert.deepEqual(readPrice({ base: "120", ct: "", bonus: "" }, "year", "STROM"), { ok: false, field: null, error: null });
  // Vertipper fallen auf: 3657 statt 36,57 ct, Jahresbetrag im Monatsfeld.
  assert.equal((readPrice({ base: "", ct: "3657", bonus: "" }, "year", "STROM") as { field: string }).field, "ct");
  assert.equal((readPrice({ base: "120,60", ct: "36,57", bonus: "" }, "month", "STROM") as { field: string }).field, "base");

  assert.equal(convertBase("10,05", "month", "year"), "120,60");
  assert.equal(convertBase("120,60", "year", "month"), "10,05");
  assert.equal(convertBase("", "year", "month"), "");
});

test("Kundentaugliche Aussage", () => {
  assert.equal(headline(2), "Über 2 Jahre sparen Sie");
  assert.equal(headline(1), "Im ersten Jahr sparen Sie");
  assert.equal(eur(109.2).replace(/\s/g, " "), "109,20 €");
  assert.equal(eur(1594.8).replace(/\s/g, " "), "1.594,80 €");
});

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

test("Gerät merkt sich Tarifpreise je Tarif und PLZ", () => {
  const store = memoryStore();
  const entry = { sparte: "STROM" as const, provider: "E wie Einfach", name: "Strom Basic", plz: "24103", baseYear: 0, ct: 41.87, bonus: 80 };
  rememberPrices([entry], store, 1000);
  assert.equal(findPrice({ ...entry, provider: "e wie einfach " }, store, 2000)?.ct, 41.87);
  // Andere PLZ, anderes Netzgebiet: kein Vorschlag.
  assert.equal(findPrice({ ...entry, plz: "20095" }, store, 2000), undefined);

  // Neuer Preis ersetzt den alten, die zuletzt benutzten stehen vorn.
  rememberPrices([{ ...entry, provider: "OStrom", name: "OStrom", ct: 33.53 }], store, 3000);
  rememberPrices([{ ...entry, ct: 40.5 }], store, 4000);
  assert.deepEqual(recentPrices("STROM", "24103", store, 5000).map((e) => [e.provider, e.ct]), [
    ["E wie Einfach", 40.5],
    ["OStrom", 33.53],
  ]);
  assert.equal(recentPrices("GAS", "24103", store, 5000).length, 0);

  // Nach einem halben Jahr ist ein Preis kein Vorschlag mehr.
  assert.equal(recentPrices("STROM", "24103", store, 4000 + 200 * 24 * 60 * 60 * 1000).length, 0);

  // Begrenzt auf die zuletzt benutzten.
  for (let i = 0; i < MAX_REMEMBERED + 5; i++) rememberPrices([{ ...entry, name: `Tarif ${i}` }], store, 10_000 + i);
  assert.equal(recentPrices("STROM", "24103", store, 20_000).length, MAX_REMEMBERED);
});

test("Laufender Vergleich bleibt einen Arbeitstag stehen", () => {
  const store = memoryStore();
  const contract = { key: "a", provider: "Stadtwerke Kiel", name: "", tariffId: null, unit: "year" as const, base: "120,60", ct: "36,57", bonus: "" };
  const draft = {
    sparte: "STROM" as const,
    years: 2,
    plz: "24103",
    strom: { kwh: "2000", current: contract, offers: [] },
    gas: { kwh: "", current: { ...contract, key: "b" }, offers: [] },
  };
  saveDraft(draft, store, 1000);
  assert.equal(loadDraft(store, 2000)?.strom.current.ct, "36,57");
  assert.equal(loadDraft(store, 1000 + 15 * 60 * 60 * 1000), null);
  saveDraft(null, store, 3000);
  assert.equal(loadDraft(store, 3000), null);
});

test("Skizze: jede Zeile lässt sich nachrechnen, die Jahre ergeben die Ersparnis", async () => {
  const { buildSketch } = await import("../../src/lib/tariff-sketch");
  const clean = (text: string) => text.replace(/\s/g, " ");
  const result = compareTariffs(2000, 2, KIEL, [{ price: E_WIE_EINFACH, meta: "E" }]);
  const sketch = buildSketch(result, result.offers[0], { current: "Stadtwerke Kiel", offer: "E wie Einfach" }, "STROM");
  assert.equal(sketch.title, "Ihr Strom über 2 Jahre");
  assert.equal(clean(sketch.subtitle), "bei 2.000 kWh im Jahr");
  assert.deepEqual(sketch.years.map((y) => y.label), ["1. Jahr", "2. Jahr"]);
  // 1. Jahr: 837,40 € − 80,00 € Bonus = 757,40 € gegen 852,00 €
  assert.deepEqual(
    Object.values(sketch.years[0].offer).map((v) => v && clean(v)),
    ["837,40 €", "− 80,00 €", "757,40 €"],
  );
  assert.deepEqual(sketch.years[0].current, { gross: sketch.years[0].current.gross, bonus: null, net: null });
  assert.equal(clean(sketch.years[0].differenceText), "94,60 €");
  assert.equal(clean(sketch.years[1].differenceText), "14,60 €");
  assert.equal(sketch.years.reduce((sum, y) => sum + y.difference, 0).toFixed(2), "109.20");
  assert.equal(clean(sketch.currentTotal), "1.704,00 €");
  assert.equal(clean(sketch.offerTotal), "1.594,80 €");
  assert.equal(`${sketch.savingLabel} ${clean(sketch.savingText)}`, "Sie sparen 109,20 €");
  assert.equal(clean(sketch.monthly), "69,78 € statt 71,00 €");

  // Nur dank Bonus günstiger: das 2. Jahr steht rot (negativ) auf dem Papier.
  const heavy = compareTariffs(3500, 2, KIEL, [{ price: E_WIE_EINFACH, meta: "E" }]);
  const loss = buildSketch(heavy, heavy.offers[0], { current: "Kiel", offer: "E" }, "STROM");
  assert.equal(clean(loss.years[0].differenceText), "15,10 €");
  assert.equal(clean(loss.years[1].differenceText), "− 64,90 €");
  assert.equal(`${loss.savingLabel} ${clean(loss.savingText)}`, "Neu teurer um 49,80 €");

  const gas = buildSketch(compareTariffs(15000, 1, KIEL, [{ price: OSTROM, meta: "O" }]), compareTariffs(15000, 1, KIEL, [{ price: OSTROM, meta: "O" }]).offers[0], { current: "a", offer: "b" }, "GAS");
  assert.equal(gas.title, "Ihr Gas im ersten Jahr");
  assert.equal(gas.years.length, 1);
});
