import type { Role, Tier } from "./types";

/*
 * Stufen im Vertrieb - ohne Datenbank, laeuft auch im Browser.
 *
 * Jede Person im Vertrieb hat eine Stufe mit festem Provisionssatz. Wer mehr
 * verkauft, steigt auf; ab Teamleiter darf man ein eigenes Team aufbauen und
 * bekommt von den Vertraegen seiner direkten Leute die Differenz zur eigenen
 * Stufe. Weitere Ebenen gibt es nicht.
 */

export const TIERS: readonly Tier[] = ["BERATER", "SENIOR", "TEAMLEITER"];

export const TIER_LABEL: Record<Tier, string> = {
  BERATER: "Berater",
  SENIOR: "Senior Berater",
  TEAMLEITER: "Teamleiter",
};

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

/** Darf Leute unter sich haben: die Geschaeftsfuehrung und jeder Teamleiter. */
export function canLeadTeam(person: { role: Role; tier: Tier }): boolean {
  return person.role === "LEADER" || person.tier === "TEAMLEITER";
}

/** "Geschäftsführung", "Senior Berater" - wie die Person in Listen und im Profil heisst. */
export function positionLabel(person: { role: Role; tier: Tier }): string {
  return person.role === "LEADER" ? "Geschäftsführung" : TIER_LABEL[person.tier] ?? TIER_LABEL.BERATER;
}
