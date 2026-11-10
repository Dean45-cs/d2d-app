import type { Role, Tier } from "../types";

/*
 * Provisionen - der Rechenkern, ohne Datenbank (laeuft auch im Browser).
 *
 * Die Geschaeftsfuehrung bekommt vom Portal je Tarif und Verbrauchsstaffel eine
 * Admin-Provision: Grund-, Aktions- und Folgeprovision. Daraus wird, was
 * jede Person bekommt:
 *
 *   1. Ein Standardsatz fuer alle (z. B. 60 %), Ausnahmen je Sparte, Anbieter
 *      oder Tarif - ein anderer Satz oder ein fester Betrag. Die genauere
 *      Regel gewinnt: Tarif vor Anbieter vor Sparte vor Standard.
 *   2. Jede Person hat eine Stufe: Berater (der Standardsatz), Senior
 *      Berater, Teamleiter. Eine hoehere Stufe verschiebt die ganze Liste um
 *      dieselben Prozentpunkte: 70 % statt 65 % sind ueberall 5 Punkte mehr,
 *      auch bei Ausnahmen. Ein individueller Satz ersetzt die Stufe.
 *   3. Ein Teamleiter bekommt von jedem Vertrag seiner direkten Leute die
 *      Differenz zwischen seinem und ihrem Betrag. Die zahlt die Firma - der
 *      Person wird nichts weggenommen. Nur direkte Leute, keine weiteren
 *      Ebenen; wird jemand selbst Teamleiter, faellt die Differenz weg.
 *
 * Boni kommen obendrauf, gehen an den, der verkauft, und bezahlt sie die
 * Geschaeftsfuehrung. Wer was sehen darf, entscheidet der Server (store.ts) - hier
 * wird nur gerechnet.
 */

export type Sparte = "STROM" | "GAS" | "SONSTIGES";
export type Segment = "PRIVAT" | "GEWERBE";
export type RuleScope = "SPARTE" | "PROVIDER" | "TARIFF";
export type RuleMode = "PERCENT" | "FIXED";
export type BonusKind = "TARIFF" | "PERSONAL" | "COMBO" | "VOLUME";
export type BonusScope = "ALL" | RuleScope;

export const SPARTEN: readonly Sparte[] = ["STROM", "GAS", "SONSTIGES"];
export const SPARTE_LABEL: Record<Sparte, string> = { STROM: "Strom", GAS: "Gas", SONSTIGES: "Sonstiges" };
export const SEGMENT_LABEL: Record<Segment, string> = { PRIVAT: "Privat", GEWERBE: "Gewerbe" };

/** Eine Verbrauchsstaffel eines Tarifs - Betraege der Geschaeftsfuehrung in Euro. */
export interface CommissionBand {
  kwh_from: number;
  kwh_to: number;
  base_eur: number;
  promo_eur: number;
  follow_eur: number;
  /** 1: die Liste nennt nur einen Platzhalter, die Provision wird je Vertrag vereinbart. */
  individual: number;
}

export interface CommissionTariff {
  id: number;
  provider: string;
  name: string;
  sparte: Sparte;
  segment: Segment;
  /** Sparte nur geraten - die Geschaeftsfuehrung sollte einmal draufschauen. */
  needs_review: number;
  /** Anteil der Provision bei Abschluss bzw. bei Lieferbeginn (0 bis 1). */
  payout_conclusion: number;
  payout_connection: number;
  /** 0: in der zuletzt importierten Liste nicht mehr dabei. */
  active: number;
  /** 1: fuer den Vertrieb ausgeblendet. */
  hidden: number;
  note: string;
  bands: CommissionBand[];
}

export interface CommissionSettings {
  /** null: noch kein Standardsatz - der Vertrieb sieht noch keine Betraege. */
  standard_percent: number | null;
  /** Aktions- und Folgeprovision anteilig weitergeben (1) oder behalten (0). */
  share_promo: number;
  share_follow: number;
  /** Satz ab Senior Berater bzw. Teamleiter; null: wie die Stufe darunter. */
  senior_percent: number | null;
  lead_percent: number | null;
}

export const DEFAULT_SETTINGS: CommissionSettings = {
  standard_percent: null,
  share_promo: 1,
  share_follow: 1,
  senior_percent: null,
  lead_percent: null,
};

/**
 * Der Satz jeder Stufe in Prozent der Admin-Provision; null ohne
 * Standardsatz. Eine hoehere Stufe bekommt nie weniger als die darunter -
 * auch wenn der Standardsatz spaeter ueber einen alten Stufensatz steigt.
 */
export function tierPercents(settings: CommissionSettings): Record<Tier, number> | null {
  const standard = settings.standard_percent;
  if (standard === null) return null;
  const senior = Math.max(standard, settings.senior_percent ?? standard);
  return { BERATER: standard, SENIOR: senior, TEAMLEITER: Math.max(senior, settings.lead_percent ?? senior) };
}

export interface CommissionRule {
  id: number;
  scope: RuleScope;
  /** Sparte (STROM), Anbieter (wie in der Liste) oder Tarif-ID als Text. */
  scope_value: string;
  mode: RuleMode;
  /** Prozent der Admin-Provision bzw. Euro je Vertrag. */
  value: number;
}

/**
 * Individueller Satz einer Person (RATE: Prozent der Admin-Provision) - er
 * ersetzt ihre Stufe. SHARE stammt aus der Zeit vor den Stufen (Anteil an der
 * Provision der Fuehrungskraft) und zaehlt nicht mehr.
 */
export interface PersonSetting {
  user_id: number;
  kind: "RATE" | "SHARE";
  value: number;
  /** Fuehrungskraft beim Festlegen - wechselt sie, gilt wieder die Stufe. */
  manager_id: number | null;
}

export interface CommissionBonus {
  id: number;
  kind: BonusKind;
  label: string;
  amount_eur: number;
  scope: BonusScope;
  scope_value: string;
  /** Persoenlicher Bonus: fuer wen. Sonst null = fuer alle. */
  user_id: number | null;
  /** Erster und letzter Tag ("2026-11-30"), jeweils einschliesslich; null = offen. */
  valid_from: string | null;
  valid_to: string | null;
  threshold: number | null;
  per_contract: number;
  active: number;
}

export interface CommissionPerson {
  id: number;
  manager_id: number | null;
  role: Role;
  tier: Tier;
  /** 0: deaktiviert - bekommt keine Differenz mehr. Fehlt die Angabe, gilt die Person als aktiv. */
  active?: number;
}

/** Was eine Person fuer einen Vertrag bekommt. promo ist in now enthalten. */
export interface Payout {
  /** Bei Abschluss bzw. Lieferbeginn. */
  now: number;
  /** Davon aus der Aktionsprovision des Portals. */
  promo: number;
  /** Folgeprovision - kommt spaeter, wenn sie der Geschaeftsfuehrung gezahlt wird. */
  follow: number;
}

/* ------------------------------- Rechnen -------------------------------- */

/** Auf Cent gerundet - ohne dass 0,615 € zu 0,61 € wird. */
export function cents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100 + (value >= 0 ? 1e-7 : -1e-7)) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(payout: Payout, adminNow: number, adminFollow: number): Payout {
  const now = cents(clamp(payout.now, 0, adminNow));
  return {
    now,
    promo: cents(clamp(payout.promo, 0, now)),
    follow: cents(clamp(payout.follow, 0, adminFollow)),
  };
}

export type RuleSource = "TARIFF" | "PROVIDER" | "SPARTE" | "STANDARD";

export interface EffectiveRule {
  mode: RuleMode;
  value: number;
  source: RuleSource;
  /** Die Folgeprovision wird immer prozentual geteilt - auch bei festem Betrag. */
  followPercent: number;
}

export interface RuleIndex {
  tariff: Map<string, CommissionRule>;
  provider: Map<string, CommissionRule>;
  sparte: Map<string, CommissionRule>;
}

/** Anbieter vergleichen wie Menschen: ohne Gross-/Kleinschreibung und Randleerzeichen. */
export function providerKey(provider: string): string {
  return provider.trim().toLocaleLowerCase("de-DE");
}

export function indexRules(rules: CommissionRule[]): RuleIndex {
  const index: RuleIndex = { tariff: new Map(), provider: new Map(), sparte: new Map() };
  for (const rule of rules) {
    if (rule.scope === "TARIFF") index.tariff.set(rule.scope_value, rule);
    else if (rule.scope === "PROVIDER") index.provider.set(providerKey(rule.scope_value), rule);
    else index.sparte.set(rule.scope_value, rule);
  }
  return index;
}

/** Welche Regel fuer einen Tarif gilt - die genauere gewinnt. */
export function effectiveRule(
  tariff: Pick<CommissionTariff, "id" | "provider" | "sparte">,
  index: RuleIndex,
  standard: number,
): EffectiveRule {
  const candidates: Array<[RuleSource, CommissionRule | undefined]> = [
    ["TARIFF", index.tariff.get(String(tariff.id))],
    ["PROVIDER", index.provider.get(providerKey(tariff.provider))],
    ["SPARTE", index.sparte.get(tariff.sparte)],
  ];
  const followPercent = candidates.find(([, rule]) => rule?.mode === "PERCENT")?.[1]?.value ?? standard;
  const match = candidates.find(([, rule]) => rule !== undefined);
  if (!match) return { mode: "PERCENT", value: standard, source: "STANDARD", followPercent };
  const [source, rule] = match as [RuleSource, CommissionRule];
  return { mode: rule.mode, value: rule.value, source, followPercent };
}

/** Was die Geschaeftsfuehrung selbst bekommt - die volle Admin-Provision. */
export function adminPayout(band: CommissionBand, promoActive: boolean): Payout {
  const promo = promoActive ? band.promo_eur : 0;
  return { now: cents(band.base_eur + promo), promo: cents(promo), follow: cents(band.follow_eur) };
}

/**
 * Die Liste der Geschaeftsfuehrung fuer den Vertrieb: Standard bzw. Ausnahme,
 * verschoben um `delta` Prozentpunkte (hoehere Stufe oder individueller Satz).
 */
export function teamPayout(
  band: CommissionBand,
  rule: EffectiveRule,
  settings: CommissionSettings,
  promoActive: boolean,
  delta = 0,
): Payout {
  const admin = adminPayout(band, promoActive);
  const sharedPromo = settings.share_promo ? admin.promo : 0;
  const basis = band.base_eur + sharedPromo;
  const follow = settings.share_follow ? ((rule.followPercent + delta) / 100) * band.follow_eur : 0;
  if (rule.mode === "PERCENT") {
    const share = (rule.value + delta) / 100;
    return round({ now: share * basis, promo: share * sharedPromo, follow }, admin.now, admin.follow);
  }
  return round({ now: rule.value + (delta / 100) * basis, promo: 0, follow }, admin.now, admin.follow);
}

/** Was oben mehr ankommt als unten - nie negativ, die Aktion nie groesser als der Betrag. */
function difference(upper: Payout, lower: Payout): Payout {
  const now = cents(Math.max(0, upper.now - lower.now));
  return {
    now,
    promo: cents(clamp(upper.promo - lower.promo, 0, now)),
    follow: cents(Math.max(0, upper.follow - lower.follow)),
  };
}

function sum(a: Payout, b: Payout): Payout {
  return { now: cents(a.now + b.now), promo: cents(a.promo + b.promo), follow: cents(a.follow + b.follow) };
}

/** Wie eine Person gerade gerechnet wird - fuer die Anzeige der Einstellung. */
export interface ResolvedSetting {
  /** ADMIN: die Geschaeftsfuehrung mit der vollen Admin-Provision. TIER: nach Stufe. */
  kind: "ADMIN" | "TIER";
  /** Stufe im Vertrieb; null bei der Geschaeftsfuehrung. */
  tier: Tier | null;
  /** Individueller Satz in Prozent der Admin-Provision; null = nach Stufe. */
  value: number | null;
  /** Der Satz, der gilt; null bei der Geschaeftsfuehrung und ohne Standardsatz. */
  percent: number | null;
  /** Teamleiter direkt darueber, der an den Vertraegen dieser Person die Differenz bekommt. */
  managerId: number | null;
}

export interface Calculator {
  /** Gibt es schon einen Standardsatz? Sonst sieht der Vertrieb keine Betraege. */
  configured: boolean;
  promoActive: boolean;
  /** Satz je Stufe; null ohne Standardsatz. */
  tiers: Record<Tier, number> | null;
  rule(tariff: CommissionTariff): EffectiveRule;
  admin(band: CommissionBand): Payout;
  /** Standardliste - was ein Berater ohne individuellen Satz bekommt. */
  standard(tariff: CommissionTariff, band: CommissionBand): Payout | null;
  /** Was diese Person bekommt; null bei individueller Provision oder ohne Standardsatz. */
  person(userId: number, tariff: CommissionTariff, band: CommissionBand): Payout | null;
  /** Der Teamleiter direkt ueber dieser Person, der die Differenz bekommt - sonst null. */
  lead(userId: number): number | null;
  /** Was dieser Teamleiter an einem Vertrag der Person bekommt: die Differenz zum eigenen Betrag. */
  override(userId: number, tariff: CommissionTariff, band: CommissionBand): Payout | null;
  /** Was ein Vertrag der Person insgesamt kostet: ihr Betrag plus die Differenz fuer den Teamleiter. */
  cost(userId: number, tariff: CommissionTariff, band: CommissionBand): Payout | null;
  setting(userId: number): ResolvedSetting;
}

export function createCalculator(input: {
  settings: CommissionSettings;
  rules: CommissionRule[];
  people: PersonSetting[];
  members: CommissionPerson[];
  promoActive: boolean;
}): Calculator {
  const { settings, promoActive } = input;
  const standard = settings.standard_percent;
  const tiers = tierPercents(settings);
  const index = indexRules(input.rules);
  const members = new Map(input.members.map((member) => [member.id, member]));
  const stored = new Map(input.people.map((setting) => [setting.user_id, setting]));

  /**
   * Nur die direkte Fuehrungskraft, und nur als aktiver Teamleiter: Wer selbst
   * Teamleiter ist, baut sein eigenes Team auf - an ihm verdient niemand.
   */
  function lead(userId: number): number | null {
    const person = members.get(userId);
    if (!person || person.role === "LEADER" || person.tier === "TEAMLEITER" || person.manager_id === null) return null;
    const manager = members.get(person.manager_id);
    if (!manager || manager.id === person.id || manager.role === "LEADER") return null;
    if (manager.tier !== "TEAMLEITER" || manager.active === 0) return null;
    return manager.id;
  }

  /** Individueller Satz - gilt nur bei derselben Fuehrungskraft wie beim Festlegen. */
  function individual(person: CommissionPerson): number | null {
    const saved = stored.get(person.id);
    return saved && saved.kind === "RATE" && saved.manager_id === person.manager_id ? saved.value : null;
  }

  function setting(userId: number): ResolvedSetting {
    const person = members.get(userId);
    if (person?.role === "LEADER") return { kind: "ADMIN", tier: null, value: null, percent: null, managerId: null };
    const tier = person?.tier ?? "BERATER";
    const value = person ? individual(person) : null;
    return { kind: "TIER", tier, value, percent: value ?? tiers?.[tier] ?? null, managerId: lead(userId) };
  }

  function rule(tariff: CommissionTariff): EffectiveRule {
    return effectiveRule(tariff, index, standard ?? 0);
  }

  function standardPayout(tariff: CommissionTariff, band: CommissionBand): Payout | null {
    if (standard === null || band.individual) return null;
    return teamPayout(band, rule(tariff), settings, promoActive);
  }

  function person(userId: number, tariff: CommissionTariff, band: CommissionBand): Payout | null {
    if (members.get(userId)?.role === "LEADER") return band.individual ? null : adminPayout(band, promoActive);
    if (standard === null || band.individual) return null;
    // Stufe oder individueller Satz verschieben die Liste um dieselben Prozentpunkte.
    const percent = setting(userId).percent ?? standard;
    return teamPayout(band, rule(tariff), settings, promoActive, percent - standard);
  }

  function override(userId: number, tariff: CommissionTariff, band: CommissionBand): Payout | null {
    const leadId = lead(userId);
    if (leadId === null) return null;
    const own = person(userId, tariff, band);
    const above = person(leadId, tariff, band);
    return own && above ? difference(above, own) : null;
  }

  function cost(userId: number, tariff: CommissionTariff, band: CommissionBand): Payout | null {
    if (members.get(userId)?.role === "LEADER") return band.individual ? null : { now: 0, promo: 0, follow: 0 };
    const own = person(userId, tariff, band);
    if (!own) return null;
    const extra = override(userId, tariff, band);
    return extra ? sum(own, extra) : own;
  }

  return {
    configured: standard !== null,
    promoActive,
    tiers,
    rule,
    admin: (band) => adminPayout(band, promoActive),
    standard: standardPayout,
    person,
    lead,
    override,
    cost,
    setting,
  };
}

/* --------------------------------- Boni --------------------------------- */

export function bonusInPeriod(bonus: Pick<CommissionBonus, "valid_from" | "valid_to">, day: string): boolean {
  return (!bonus.valid_from || bonus.valid_from <= day) && (!bonus.valid_to || day <= bonus.valid_to);
}

export function bonusMatches(
  bonus: Pick<CommissionBonus, "scope" | "scope_value">,
  tariff: Pick<CommissionTariff, "id" | "provider" | "sparte">,
): boolean {
  if (bonus.scope === "ALL") return true;
  if (bonus.scope === "SPARTE") return bonus.scope_value === tariff.sparte;
  if (bonus.scope === "PROVIDER") return providerKey(bonus.scope_value) === providerKey(tariff.provider);
  return bonus.scope_value === String(tariff.id);
}

/** Boni je Vertrag, die heute fuer diese Person auf diesen Tarif gelten. */
export function tariffBonuses(
  bonuses: CommissionBonus[],
  tariff: Pick<CommissionTariff, "id" | "provider" | "sparte">,
  userId: number,
  day: string,
): CommissionBonus[] {
  return bonuses.filter(
    (bonus) =>
      bonus.active &&
      (bonus.kind === "TARIFF" || bonus.kind === "PERSONAL") &&
      (bonus.user_id === null || bonus.user_id === userId) &&
      bonusInPeriod(bonus, day) &&
      bonusMatches(bonus, tariff),
  );
}

/** Kombi-Boni (Strom und Gas beim selben Kunden), die heute fuer diese Person gelten. */
export function comboBonuses(bonuses: CommissionBonus[], userId: number, day: string): CommissionBonus[] {
  return bonuses.filter(
    (bonus) =>
      bonus.active &&
      bonus.kind === "COMBO" &&
      (bonus.user_id === null || bonus.user_id === userId) &&
      bonusInPeriod(bonus, day),
  );
}

/* ------------------------------ Einordnen ------------------------------- */

const GAS = /gas/i;
const STROM = /strom|power|w(ä|ae)rme|nachtspeicher|heiz|lade/i;
const OTHER = /schutz|versicherung|zusatz|rlm-tarife|diverser anbieter/i;
const BUSINESS = /gewerbe|business|profi|\brlm\b|\bslp\b/i;

/**
 * Sparte und Kundenart aus Anbieter und Tarifname - der Export des Portals
 * nennt beides nicht. "Strom spar24" von Goldgas ist Strom: entscheidend ist
 * der Tarif, nicht der Anbieter. Steht im Namen weder Strom noch Gas, ist
 * Strom nur geraten und die Geschaeftsfuehrung sollte einmal draufschauen.
 */
export function classifyTariff(provider: string, name: string): { sparte: Sparte; segment: Segment; needsReview: boolean } {
  const segment: Segment = BUSINESS.test(name) ? "GEWERBE" : "PRIVAT";
  if (OTHER.test(provider) || OTHER.test(name)) return { sparte: "SONSTIGES", segment, needsReview: false };
  if (GAS.test(name)) return { sparte: "GAS", segment, needsReview: false };
  if (STROM.test(name) || /strom/i.test(provider)) return { sparte: "STROM", segment, needsReview: false };
  return { sparte: "STROM", segment, needsReview: true };
}

/** Name ohne das Wort Gas/Erdgas - "Energy Gas Bonus 24" wird "energy bonus 24". */
function withoutGasWord(name: string): string {
  return name.replace(/\b(erd)?gas\b/gi, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("de-DE");
}

/**
 * Wie classifyTariff fuer eine ganze Liste: Hat derselbe Anbieter denselben
 * Tarif noch einmal mit "Gas" im Namen ("EinPreisTarif 24 Gas"), ist der
 * Tarif ohne Gas sicher Strom - dann muss niemand mehr draufschauen.
 */
export function classifyTariffs(list: Array<{ provider: string; name: string }>) {
  const key = (provider: string, name: string) => `${providerKey(provider)}\u0000${name}`;
  const twins = new Set(
    list.filter((item) => GAS.test(item.name)).map((item) => key(item.provider, withoutGasWord(item.name))),
  );
  return list.map((item) => {
    const result = classifyTariff(item.provider, item.name);
    if (result.needsReview && twins.has(key(item.provider, item.name.replace(/\s+/g, " ").trim().toLocaleLowerCase("de-DE")))) {
      return { ...result, needsReview: false };
    }
    return result;
  });
}

/* -------------------------------- Format -------------------------------- */

/** "84 €", "82,50 €" - Cent nur, wenn es welche gibt. */
export function money(value: number): string {
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  return value.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/** "60 %", "62,5 %" */
export function percentLabel(value: number): string {
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
}

/** Ab hier gilt eine Staffel als "jeder Verbrauch" - das Portal schreibt 1.000.000 oder 1.500.000. */
const OPEN_END = 1_000_000;

/** "1.000–2.499 kWh", "ab 4.000 kWh", "bis 30.000 kWh", "jeder Verbrauch" */
export function kwhRange(from: number, to: number): string {
  const n = (value: number) => value.toLocaleString("de-DE");
  if (from <= 1 && to >= OPEN_END) return "jeder Verbrauch";
  if (to >= OPEN_END) return `ab ${n(from)} kWh`;
  if (from <= 1) return `bis ${n(to)} kWh`;
  return `${n(from)}–${n(to)} kWh`;
}

/** Die Staffel fuer einen Jahresverbrauch - undefined, wenn der Tarif dafuer nicht gilt. */
export function bandFor<T extends Pick<CommissionBand, "kwh_from" | "kwh_to">>(bands: T[], kwh: number): T | undefined {
  return bands.find((band) => band.kwh_from <= kwh && kwh <= band.kwh_to);
}

/** Wann die Provision kommt - "bei Abschluss", "bei Lieferbeginn" oder geteilt. */
export function payoutLabel(conclusion: number, connection: number): string {
  if (connection <= 0) return "bei Abschluss";
  if (conclusion <= 0) return "bei Lieferbeginn";
  return `${Math.round(conclusion * 100)} % bei Abschluss, ${Math.round(connection * 100)} % bei Lieferbeginn`;
}
