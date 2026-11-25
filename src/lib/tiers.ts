import type { Role, Tier } from "./types";

/*
 * Raenge im Vertrieb - ohne Datenbank, laeuft auch im Browser.
 *
 * Vier feste Stufen von unten nach oben: Berater, Senior Berater, Junior
 * Teamleiter, Teamleiter. Die Geschaeftsfuehrung kann sie umbenennen und je
 * Rang festlegen, ob er ein Team haben darf (und damit von den Vertraegen
 * seiner Leute die Differenz bekommt). Der Satz je Rang steht bei den
 * Provisionen (commission_settings), die Ziele in ranks.ts.
 */

export const TIERS: readonly Tier[] = ["BERATER", "SENIOR", "JUNIOR_LEAD", "TEAMLEITER"];

/** Die Namen ab Werk - die Geschaeftsfuehrung kann sie aendern (RankSetup). */
export const TIER_LABEL: Record<Tier, string> = {
  BERATER: "Berater",
  SENIOR: "Senior Berater",
  JUNIOR_LEAD: "Junior Teamleiter",
  TEAMLEITER: "Teamleiter",
};

export interface RankInfo {
  label: string;
  /** Darf Leute unter sich haben und bekommt an deren Vertraegen die Differenz. */
  team: boolean;
}

/** Wie ein Team seine Raenge eingestellt hat. */
export type RankSetup = Record<Tier, RankInfo>;

export const DEFAULT_RANKS: RankSetup = {
  BERATER: { label: TIER_LABEL.BERATER, team: false },
  SENIOR: { label: TIER_LABEL.SENIOR, team: false },
  JUNIOR_LEAD: { label: TIER_LABEL.JUNIOR_LEAD, team: true },
  TEAMLEITER: { label: TIER_LABEL.TEAMLEITER, team: true },
};

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

/** 0 fuer Berater bis 3 fuer Teamleiter. */
export function tierIndex(tier: Tier): number {
  return Math.max(0, TIERS.indexOf(tier));
}

/** Der Rang darueber - null ganz oben. */
export function nextTier(tier: Tier): Tier | null {
  return TIERS[tierIndex(tier) + 1] ?? null;
}

/** Der Rang darunter - null ganz unten. */
export function previousTier(tier: Tier): Tier | null {
  const index = tierIndex(tier);
  return index > 0 ? TIERS[index - 1] : null;
}

export function rankLabel(tier: Tier, ranks: RankSetup = DEFAULT_RANKS): string {
  return ranks[tier]?.label || TIER_LABEL[tier] || TIER_LABEL.BERATER;
}

/**
 * Ein Team ist nach oben offen: darf ein Rang Leute haben, duerfen es alle
 * darueber auch. So steht nie ein Team unter jemandem, der befoerdert wurde
 * und dabei sein Team verlieren muesste.
 */
export function normalizeRanks(ranks: RankSetup): RankSetup {
  const out = { ...ranks };
  let team = false;
  for (const tier of TIERS) {
    team = team || out[tier].team;
    out[tier] = { ...out[tier], team };
  }
  return out;
}

/** Darf Leute unter sich haben: die Geschaeftsfuehrung und jeder Rang mit Team. */
export function canLeadTeam(person: { role: Role; tier: Tier }, ranks: RankSetup = DEFAULT_RANKS): boolean {
  return person.role === "LEADER" || Boolean(ranks[person.tier]?.team);
}

/** "Geschäftsführung", "Senior Berater" - wie die Person in Listen und im Profil heisst. */
export function positionLabel(person: { role: Role; tier: Tier }, ranks: RankSetup = DEFAULT_RANKS): string {
  return person.role === "LEADER" ? "Geschäftsführung" : rankLabel(person.tier, ranks);
}
