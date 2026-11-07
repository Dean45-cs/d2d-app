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

/* Rechenkern ohne Datenbank: Regeln, persoenliche Saetze, Struktur, Boni. */

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

// Teamleitung (1) -> Lisa (2) -> Tom (3) -> Max (4); Paul (5) direkt unter der Teamleitung.
const members: CommissionPerson[] = [
  { id: 1, manager_id: null, role: "LEADER" },
  { id: 2, manager_id: 1, role: "MEMBER" },
  { id: 3, manager_id: 2, role: "MEMBER" },
  { id: 4, manager_id: 3, role: "MEMBER" },
  { id: 5, manager_id: 1, role: "MEMBER" },
];
const LEADER = 1, LISA = 2, TOM = 3, MAX = 4, PAUL = 5;
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
  // Aktion behalten: die Teamleitung bekommt sie, der Vertrieb nur den Satz der Grundprovision.
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

test("ein persoenlicher Satz verschiebt die ganze Liste um dieselben Prozentpunkte", () => {
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
  // Nie mehr als die Teamleitung selbst bekommt, nie weniger als nichts.
  const greedy = calc({ people: [{ user_id: PAUL, kind: "RATE", value: 140, manager_id: LEADER }] });
  assert.equal(greedy.person(PAUL, plain, plain.bands[0])!.now, 150);
  const zero = calc({ people: [{ user_id: PAUL, kind: "RATE", value: 0, manager_id: LEADER }], rules: [rule("TARIFF", "5", "FIXED", 10)] });
  assert.equal(zero.person(PAUL, fixed, fixed.bands[0])!.now, 0);
});

test("Fuehrungskraefte geben einen Anteil weiter und behalten die Differenz - ueber mehrere Ebenen", () => {
  const t = tariff(6, "Lichtwerk", "Licht Ökostrom 24", [band(150)]);
  const [b] = t.bands;
  const lisa = { user_id: LISA, kind: "RATE" as const, value: 70, manager_id: LEADER };
  const tom = { user_id: TOM, kind: "SHARE" as const, value: 80, manager_id: LISA };
  // Ohne Einstellung: Standard, hoechstens so viel wie die Fuehrungskraft.
  assert.equal(calc({ people: [lisa] }).person(TOM, t, b)!.now, 90);
  assert.equal(calc({ people: [{ ...lisa, value: 50 }] }).person(TOM, t, b)!.now, 75);
  // Mit Anteil: 80 % von Lisas 105 €.
  const c = calc({ people: [lisa, tom] });
  assert.equal(c.person(LISA, t, b)!.now, 105);
  assert.equal(c.person(TOM, t, b)!.now, 84);
  // Max unter Tom ohne Einstellung: Standard (90 €), gedeckelt auf Toms 84 €.
  assert.equal(c.person(MAX, t, b)!.now, 84);
  const withMax = calc({ people: [lisa, tom, { user_id: MAX, kind: "SHARE", value: 75, manager_id: TOM }] });
  assert.equal(withMax.person(MAX, t, b)!.now, 63);
  assert.deepEqual(withMax.chain(MAX), [MAX, TOM, LISA]);
  assert.deepEqual(withMax.setting(TOM), { kind: "SHARE", value: 80, managerId: LISA });
  assert.deepEqual(withMax.setting(LISA), { kind: "RATE", value: 70, managerId: null });
  assert.deepEqual(withMax.setting(LEADER), { kind: "ADMIN", value: null, managerId: null });
});

test("nach einem Wechsel der Fuehrungskraft gilt wieder der Standard", () => {
  const t = tariff(8, "Lichtwerk", "Licht Ökostrom 24", [band(150)]);
  const moved = members.map((m) => (m.id === TOM ? { ...m, manager_id: PAUL } : m));
  const c = calc({ members: moved, people: [{ user_id: TOM, kind: "SHARE", value: 50, manager_id: LISA }] });
  assert.deepEqual(c.setting(TOM), { kind: "SHARE", value: null, managerId: PAUL });
  assert.equal(c.person(TOM, t, t.bands[0])!.now, 90);
  // Ein persoenlicher Satz gilt nicht mehr, sobald jemand unter eine Fuehrungskraft aus dem Vertrieb rutscht.
  const under = calc({ people: [{ user_id: PAUL, kind: "RATE", value: 80, manager_id: LEADER }], members: members.map((m) => (m.id === PAUL ? { ...m, manager_id: LISA } : m)) });
  assert.deepEqual(under.setting(PAUL), { kind: "SHARE", value: null, managerId: LISA });
});

test("Teamleitung bekommt alles, ohne Standardsatz und bei individueller Provision gibt es keinen Betrag", () => {
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
    { id: 10, manager_id: 11, role: "MEMBER" },
    { id: 11, manager_id: 10, role: "MEMBER" },
  ];
  const t = tariff(10, "Lichtwerk", "Licht Ökostrom 24", [band(100)]);
  const c = calc({ members: loop, people: [{ user_id: 11, kind: "SHARE", value: 80, manager_id: 10 }] });
  assert.deepEqual(c.chain(10), [10, 11]);
  assert.equal(c.person(10, t, t.bands[0])!.now, 60);
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
