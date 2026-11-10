import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bandFor,
  cents,
  classifyTariff,
  comboBonuses,
  createCalculator,
  DEFAULT_SETTINGS,
  effectiveRule,
  indexRules,
  kwhRange,
  money,
  payoutLabel,
  tariffBonuses,
  type CommissionBand,
  type CommissionBonus,
  type CommissionPerson,
  type CommissionRule,
  type CommissionSettings,
  type CommissionTariff,
  type PersonSetting,
} from "../../src/lib/commissions/model";

/* Rechenkern ohne Datenbank: Regeln, Stufen, individuelle Saetze, Differenz fuer Teamleiter, Boni. */

const band = (base: number, promo = 0, follow = 0, from = 1, to = 100000): CommissionBand => ({
  kwh_from: from, kwh_to: to, base_eur: base, promo_eur: promo, follow_eur: follow, individual: 0,
});
const tariff = (id: number, provider: string, name: string, bands: CommissionBand[], sparte: CommissionTariff["sparte"] = "STROM"): CommissionTariff => ({
  id, provider, name, sparte, segment: "PRIVAT", needs_review: 0, payout_conclusion: 1, payout_connection: 0,
  active: 1, hidden: 0, note: "", bands,
});
const settings = (patch: Partial<CommissionSettings> = {}): CommissionSettings => ({ ...DEFAULT_SETTINGS, standard_percent: 60, ...patch });
let ruleId = 0;
const rule = (scope: CommissionRule["scope"], scope_value: string, mode: CommissionRule["mode"], value: number): CommissionRule => ({ id: ++ruleId, scope, scope_value, mode, value });

// Geschaeftsfuehrung (1) -> Lisa (2, Teamleiterin) -> Tom (3, Berater), Max (4, Senior Berater) und Mia (6, Teamleiterin) -> Ole (7).
// Paul (5) direkt unter der Geschaeftsfuehrung.
const members: CommissionPerson[] = [
  { id: 1, manager_id: null, role: "LEADER", tier: "BERATER" },
  { id: 2, manager_id: 1, role: "MEMBER", tier: "TEAMLEITER" },
  { id: 3, manager_id: 2, role: "MEMBER", tier: "BERATER" },
  { id: 4, manager_id: 2, role: "MEMBER", tier: "SENIOR" },
  { id: 5, manager_id: 1, role: "MEMBER", tier: "BERATER" },
  { id: 6, manager_id: 2, role: "MEMBER", tier: "TEAMLEITER" },
  { id: 7, manager_id: 6, role: "MEMBER", tier: "BERATER" },
];
const LEADER = 1, LISA = 2, TOM = 3, MAX = 4, PAUL = 5, MIA = 6, OLE = 7;
/** Die Saetze der Praesentation: Berater 65 %, Senior Berater 70 %, Teamleiter 75 %. */
const tiered = (patch: Partial<CommissionSettings> = {}) => settings({ standard_percent: 65, senior_percent: 70, lead_percent: 75, ...patch });
const calc = (opts: { settings?: CommissionSettings; rules?: CommissionRule[]; people?: PersonSetting[]; members?: CommissionPerson[]; promoActive?: boolean } = {}) =>
  createCalculator({
    settings: opts.settings ?? settings(),
    rules: opts.rules ?? [],
    people: opts.people ?? [],
    members: opts.members ?? members,
    promoActive: opts.promoActive ?? true,
  });

test("Betraege werden kaufmaennisch auf Cent gerundet", () => {
  assert.equal(cents(0.615), 0.62);
  assert.equal(cents(1.005), 1.01);
  assert.equal(cents(82.5), 82.5);
  assert.equal(cents(-0.615), -0.62);
  assert.equal(cents(Number.NaN), 0);
});

test("die genauere Regel gewinnt: Tarif vor Anbieter vor Sparte vor Standard", () => {
  const eon = tariff(7, "Ostwerk", "Ost Strom 24", [band(100, 40)]);
  const rules = [rule("SPARTE", "STROM", "PERCENT", 55), rule("PROVIDER", "ostwerk", "PERCENT", 65)];
  assert.deepEqual(effectiveRule(eon, indexRules([]), 60), { mode: "PERCENT", value: 60, source: "STANDARD", followPercent: 60 });
  assert.equal(effectiveRule(eon, indexRules(rules.slice(0, 1)), 60).value, 55);
  // Anbieter ohne Gross-/Kleinschreibung
  assert.deepEqual(effectiveRule(eon, indexRules(rules), 60), { mode: "PERCENT", value: 65, source: "PROVIDER", followPercent: 65 });
  // Fester Betrag fuer den Tarif - die Folgeprovision teilt weiter der naechste Prozentsatz.
  const fixed = [...rules, rule("TARIFF", "7", "FIXED", 90)];
  assert.deepEqual(effectiveRule(eon, indexRules(fixed), 60), { mode: "FIXED", value: 90, source: "TARIFF", followPercent: 65 });
  // Die Sparte eines anderen Tarifs zaehlt nicht.
  assert.equal(effectiveRule({ ...eon, sparte: "GAS" }, indexRules(rules.slice(0, 1)), 60).source, "STANDARD");
});

test("Standardsatz: Grund- und Aktionsprovision anteilig, die Aktion nur solange sie gilt", () => {
  const t = tariff(1, "Nordwerk", "Nordgas 24", [band(100, 80, 0, 1, 1500000)], "GAS");
  const [b] = t.bands;
  assert.deepEqual(calc().standard(t, b), { now: 108, promo: 48, follow: 0 });
  assert.deepEqual(calc().admin(b), { now: 180, promo: 80, follow: 0 });
  // Aktion abgelaufen: nur noch die Grundprovision.
  assert.deepEqual(calc({ promoActive: false }).standard(t, b), { now: 60, promo: 0, follow: 0 });
  assert.deepEqual(calc({ promoActive: false }).admin(b), { now: 100, promo: 0, follow: 0 });
  // Aktion behalten: die Geschaeftsfuehrung bekommt sie, der Vertrieb nur den Satz der Grundprovision.
  assert.deepEqual(calc({ settings: settings({ share_promo: 0 }) }).standard(t, b), { now: 60, promo: 0, follow: 0 });
});

test("Folgeprovision wird prozentual geteilt oder behalten", () => {
  const t = tariff(2, "Südwerk", "Südstrom Business 24", [band(80, 0, 80, 10000, 19999)]);
  const [b] = t.bands;
  assert.deepEqual(calc().standard(t, b), { now: 48, promo: 0, follow: 48 });
  assert.deepEqual(calc({ settings: settings({ share_follow: 0 }) }).standard(t, b), { now: 48, promo: 0, follow: 0 });
  // Fester Betrag: der gilt fuer jetzt, die Folgeprovision bleibt beim Satz.
  const fixed = calc({ rules: [rule("TARIFF", "2", "FIXED", 50)] });
  assert.deepEqual(fixed.standard(t, b), { now: 50, promo: 0, follow: 48 });
});

test("ein individueller Satz verschiebt die ganze Liste um dieselben Prozentpunkte", () => {
  const plain = tariff(3, "Lichtwerk", "Licht Ökostrom 24", [band(150)]);
  const eon = tariff(4, "Ostwerk", "Ost Strom 24", [band(150)]);
  const fixed = tariff(5, "Westwerk", "West Öko Aktiv", [band(150)]);
  const c = calc({
    rules: [rule("PROVIDER", "OSTWERK", "PERCENT", 65), rule("TARIFF", "5", "FIXED", 90)],
    people: [{ user_id: LISA, kind: "RATE", value: 70, manager_id: LEADER }],
  });
  assert.equal(c.person(PAUL, plain, plain.bands[0])!.now, 90);
  assert.equal(c.person(LISA, plain, plain.bands[0])!.now, 105);
  assert.equal(c.person(LISA, eon, eon.bands[0])!.now, 112.5);
  assert.equal(c.person(LISA, fixed, fixed.bands[0])!.now, 105);
  // Nie mehr als die Geschaeftsfuehrung selbst bekommt, nie weniger als nichts.
  const greedy = calc({ people: [{ user_id: PAUL, kind: "RATE", value: 140, manager_id: LEADER }] });
  assert.equal(greedy.person(PAUL, plain, plain.bands[0])!.now, 150);
  const zero = calc({ people: [{ user_id: PAUL, kind: "RATE", value: 0, manager_id: LEADER }], rules: [rule("TARIFF", "5", "FIXED", 10)] });
  assert.equal(zero.person(PAUL, fixed, fixed.bands[0])!.now, 0);
});

test("Stufen: Berater, Senior Berater und Teamleiter bekommen ihren Satz - egal, unter wem sie stehen", () => {
  // 184,62 € Admin-Provision: der Vertrag aus der Praesentation.
  const t = tariff(6, "Lichtwerk", "Licht Ökostrom 24", [band(184.62, 0, 40)]);
  const [b] = t.bands;
  const c = calc({ settings: tiered() });
  assert.deepEqual(c.tiers, { BERATER: 65, SENIOR: 70, TEAMLEITER: 75 });
  assert.equal(c.person(PAUL, t, b)!.now, 120);
  assert.equal(c.person(TOM, t, b)!.now, 120, "ein Berater im Team eines Teamleiters behaelt seine 65 %");
  assert.equal(c.person(MAX, t, b)!.now, 129.23);
  assert.equal(c.person(LISA, t, b)!.now, 138.47);
  assert.equal(c.person(MIA, t, b)!.now, 138.47);
  // Auch die Folgeprovision folgt der Stufe, und Ausnahmen verschieben sich mit.
  assert.deepEqual([c.person(TOM, t, b)!.follow, c.person(LISA, t, b)!.follow], [26, 30]);
  const gas = calc({ settings: tiered(), rules: [rule("TARIFF", "6", "PERCENT", 50)] });
  assert.deepEqual([gas.person(TOM, t, b)!.now, gas.person(LISA, t, b)!.now], [92.31, 110.77]);
  assert.deepEqual(c.setting(MAX), { kind: "TIER", tier: "SENIOR", value: null, percent: 70, managerId: LISA });
  assert.deepEqual(c.setting(LEADER), { kind: "ADMIN", tier: null, value: null, percent: null, managerId: null });
  // Ohne eigenen Satz bekommt eine Stufe so viel wie die darunter - nie weniger.
  assert.deepEqual(calc().tiers, { BERATER: 60, SENIOR: 60, TEAMLEITER: 60 });
  assert.deepEqual(calc({ settings: tiered({ senior_percent: null }) }).tiers, { BERATER: 65, SENIOR: 65, TEAMLEITER: 75 });
  assert.deepEqual(calc({ settings: tiered({ standard_percent: 72 }) }).tiers, { BERATER: 72, SENIOR: 72, TEAMLEITER: 75 });
  assert.equal(calc({ settings: DEFAULT_SETTINGS }).tiers, null);
});

test("ein Teamleiter bekommt die Differenz nur von seinen direkten Leuten - keine weiteren Ebenen", () => {
  const t = tariff(7, "Lichtwerk", "Licht Ökostrom 24", [band(184.62, 0, 40)]);
  const [b] = t.bands;
  const c = calc({ settings: tiered() });
  // 75 % - 65 % = 10 %: rund 18,46 € je Vertrag eines Beraters, beim Senior Berater 5 %.
  assert.deepEqual([c.lead(TOM), c.override(TOM, t, b)], [LISA, { now: 18.47, promo: 0, follow: 4 }]);
  assert.deepEqual([c.lead(MAX), c.override(MAX, t, b)!.now], [LISA, 9.24]);
  // Wer selbst Teamleiter ist, baut sein eigenes Team auf: die Differenz faellt weg.
  assert.deepEqual([c.lead(MIA), c.override(MIA, t, b)], [null, null]);
  // Ole gehoert zu Mia - Lisa bekommt von seinen Vertraegen nichts.
  assert.deepEqual([c.lead(OLE), c.override(OLE, t, b)!.now], [MIA, 18.47]);
  // Direkt unter der Geschaeftsfuehrung verdient niemand mit.
  assert.deepEqual([c.lead(PAUL), c.override(PAUL, t, b), c.lead(LISA), c.lead(LEADER)], [null, null, null, null]);
  // Dem Berater wird nichts abgezogen: der Vertrag kostet seinen Betrag plus die Differenz.
  assert.equal(c.cost(TOM, t, b)!.now, 138.47);
  assert.equal(c.cost(OLE, t, b)!.now, 138.47, "auch zwei Ebenen tief kostet ein Vertrag nie mehr als 75 %");
  assert.equal(c.cost(PAUL, t, b)!.now, 120);
  assert.equal(c.cost(MIA, t, b)!.now, 138.47);
  assert.deepEqual(c.cost(LEADER, t, b), { now: 0, promo: 0, follow: 0 });

  // Nur Teamleiter haben ein Team: steht jemand unter einem Berater, bekommt der nichts.
  const loose = members.map((m) => (m.id === OLE ? { ...m, manager_id: TOM } : m));
  assert.deepEqual([calc({ settings: tiered(), members: loose }).lead(OLE), calc({ settings: tiered(), members: loose }).override(OLE, t, b)], [null, null]);
  // Ein deaktivierter Teamleiter bekommt keine Differenz mehr.
  const gone = members.map((m) => (m.id === LISA ? { ...m, active: 0 } : m));
  assert.equal(calc({ settings: tiered(), members: gone }).lead(TOM), null);
  // Ein individueller Satz ueber dem des Teamleiters: die Differenz ist null, nie negativ.
  const high = calc({ settings: tiered(), people: [{ user_id: TOM, kind: "RATE", value: 80, manager_id: LISA }] });
  assert.deepEqual([high.person(TOM, t, b)!.now, high.override(TOM, t, b)!.now], [147.7, 0]);
  // Die Aktionsprovision teilt sich wie der Betrag.
  const promo = tariff(8, "Ostwerk", "Ost Strom 24", [band(100, 40)]);
  assert.deepEqual(c.override(TOM, promo, promo.bands[0]), { now: 14, promo: 4, follow: 0 });
});

test("ein individueller Satz gilt nur bei derselben Fuehrungskraft - alte Anteile zaehlen nicht mehr", () => {
  const t = tariff(8, "Lichtwerk", "Licht Ökostrom 24", [band(150)]);
  const c = calc({ settings: tiered(), people: [{ user_id: TOM, kind: "RATE", value: 68, manager_id: LISA }] });
  assert.deepEqual(c.setting(TOM), { kind: "TIER", tier: "BERATER", value: 68, percent: 68, managerId: LISA });
  assert.equal(c.person(TOM, t, t.bands[0])!.now, 102);
  const moved = members.map((m) => (m.id === TOM ? { ...m, manager_id: MIA } : m));
  const after = calc({ settings: tiered(), members: moved, people: [{ user_id: TOM, kind: "RATE", value: 68, manager_id: LISA }] });
  assert.deepEqual(after.setting(TOM), { kind: "TIER", tier: "BERATER", value: null, percent: 65, managerId: MIA });
  // SHARE stammt aus der Zeit vor den Stufen: 50 % von Lisas Provision gibt es nicht mehr.
  const legacy = calc({ settings: tiered(), people: [{ user_id: TOM, kind: "SHARE", value: 50, manager_id: LISA }] });
  assert.deepEqual([legacy.setting(TOM).value, legacy.person(TOM, t, t.bands[0])!.now], [null, 97.5]);
});

test("Geschaeftsfuehrung bekommt alles, ohne Standardsatz und bei individueller Provision gibt es keinen Betrag", () => {
  const t = tariff(9, "Spotwerk", "Spot Strom RLM", [band(0.001, 0, 0, 0, 1000000)]);
  const individual = { ...t.bands[0], individual: 1 };
  const normal = band(150, 20, 10);
  assert.deepEqual(calc().person(LEADER, t, normal), { now: 170, promo: 20, follow: 10 });
  assert.equal(calc().person(PAUL, t, individual), null);
  assert.equal(calc().standard(t, individual), null);
  const unconfigured = calc({ settings: DEFAULT_SETTINGS });
  assert.equal(unconfigured.configured, false);
  assert.equal(unconfigured.person(PAUL, t, normal), null);
  assert.equal(unconfigured.standard(t, normal), null);
});

test("ein Kreis in der Struktur haengt die Rechnung nicht auf", () => {
  const loop: CommissionPerson[] = [
    { id: 10, manager_id: 11, role: "MEMBER", tier: "BERATER" },
    { id: 11, manager_id: 10, role: "MEMBER", tier: "TEAMLEITER" },
    { id: 12, manager_id: 12, role: "MEMBER", tier: "TEAMLEITER" },
    { id: 13, manager_id: 13, role: "MEMBER", tier: "BERATER" },
  ];
  const t = tariff(10, "Lichtwerk", "Licht Ökostrom 24", [band(100)]);
  const c = calc({ settings: tiered(), members: loop });
  assert.deepEqual([c.lead(10), c.lead(11), c.lead(12), c.lead(13)], [11, null, null, null]);
  assert.deepEqual([c.person(10, t, t.bands[0])!.now, c.cost(10, t, t.bands[0])!.now, c.cost(13, t, t.bands[0])!.now], [65, 75, 65]);
});

test("Boni gelten je Zeitraum, Person und Tarif", () => {
  const t = { id: 3, provider: "Ostwerk", sparte: "STROM" as const };
  const bonus = (patch: Partial<CommissionBonus>): CommissionBonus => ({
    id: 1, kind: "TARIFF", label: "", amount_eur: 20, scope: "ALL", scope_value: "", user_id: null,
    valid_from: null, valid_to: null, threshold: null, per_contract: 1, active: 1, ...patch,
  });
  const all = [
    bonus({ id: 1 }),
    bonus({ id: 2, scope: "PROVIDER", scope_value: "ostwerk" }),
    bonus({ id: 3, scope: "SPARTE", scope_value: "GAS" }),
    bonus({ id: 4, scope: "TARIFF", scope_value: "3", valid_to: "2026-11-30" }),
    bonus({ id: 5, kind: "PERSONAL", user_id: TOM, valid_from: "2026-11-01", valid_to: "2026-11-28" }),
    bonus({ id: 6, active: 0 }),
    bonus({ id: 7, kind: "COMBO", amount_eur: 15 }),
    bonus({ id: 8, kind: "VOLUME", threshold: 20 }),
  ];
  const ids = (list: CommissionBonus[]) => list.map((b) => b.id);
  assert.deepEqual(ids(tariffBonuses(all, t, TOM, "2026-11-07")), [1, 2, 4, 5]);
  assert.deepEqual(ids(tariffBonuses(all, t, PAUL, "2026-11-07")), [1, 2, 4]);
  assert.deepEqual(ids(tariffBonuses(all, t, TOM, "2026-12-01")), [1, 2]);
  assert.deepEqual(ids(tariffBonuses(all, t, TOM, "2026-10-31")), [1, 2, 4]);
  assert.deepEqual(ids(comboBonuses(all, TOM, "2026-11-07")), [7]);
});

test("Sparte und Kundenart werden aus dem Tarifnamen erkannt", () => {
  const cases: Array<[string, string, string, string, boolean]> = [
    ["Goldgas", "Strom spar24", "STROM", "PRIVAT", false],
    ["Goldgas", "Gas goldgas spar24 Bio15", "GAS", "PRIVAT", false],
    ["Badenova", "Erdgas 24 Gewerbe A0", "GAS", "GEWERBE", false],
    ["EWE", "EWE business Grünstrom 24", "STROM", "GEWERBE", false],
    ["Vattenfall", "Profi 24 Gas Vario", "GAS", "GEWERBE", false],
    ["Fuxx Energie", "Power-Fuxx24 smart", "STROM", "PRIVAT", false],
    ["OStrom", "SimplyFair12", "STROM", "PRIVAT", false],
    ["E wie Einfach", "EinPreisTarif 24", "STROM", "PRIVAT", true],
    ["Lichtblick", "Wärmepumpe DT 24", "STROM", "PRIVAT", false],
    ["SGB Energie GmbH", "Spot Gas SLP VZ FLEX Gewerbekunden", "GAS", "GEWERBE", false],
    ["RLM-Festpreis-Tool", "RLM-Tarife diverser Anbieter – individuelle Provision", "SONSTIGES", "GEWERBE", false],
    ["Zusatzdienste", "RundumSchutz24", "SONSTIGES", "PRIVAT", false],
  ];
  for (const [provider, name, sparte, segment, needsReview] of cases) {
    assert.deepEqual(classifyTariff(provider, name), { sparte, segment, needsReview }, `${provider} · ${name}`);
  }
});

test("Staffeln und Betraege lesen sich wie auf dem Preisblatt", () => {
  const plain = (text: string) => text.replace(/\s/g, " ");
  assert.equal(kwhRange(1, 1500000), "jeder Verbrauch");
  assert.equal(plain(kwhRange(1, 2499)), "bis 2.499 kWh");
  assert.equal(plain(kwhRange(4000, 1500000)), "ab 4.000 kWh");
  assert.equal(plain(kwhRange(2500, 99999)), "2.500–99.999 kWh");
  const bands = [band(45, 0, 0, 1, 2499), band(75, 0, 0, 2500, 99999)];
  assert.equal(bandFor(bands, 2499)?.base_eur, 45);
  assert.equal(bandFor(bands, 2500)?.base_eur, 75);
  assert.equal(bandFor(bands, 100000), undefined);
  assert.equal(plain(money(84)), "84 €");
  assert.equal(plain(money(82.5)), "82,50 €");
  assert.equal(plain(money(1250)), "1.250 €");
  assert.equal(payoutLabel(1, 0), "bei Abschluss");
  assert.equal(payoutLabel(0, 1), "bei Lieferbeginn");
});
