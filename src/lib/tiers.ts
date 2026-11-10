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

/* ------------------------------- Pyramide ------------------------------- */

export type PyramidLevelKey = "LEADER" | Tier;

export interface PyramidPerson {
  id: number;
  name: string;
  avatar: string;
  /** Aktive Leute direkt darunter - bei allen, die ein Team haben duerfen. */
  team: number;
}

export interface PyramidLevel {
  key: PyramidLevelKey;
  label: string;
  people: PyramidPerson[];
}

type PyramidMember = {
  id: number;
  name: string;
  avatar: string;
  role: Role;
  tier: Tier;
  active: number;
  manager_id: number | null;
};

/** Von der Spitze zur Basis - so steht die Pyramide auf der Seite "Stufen". */
const PYRAMID_ORDER: readonly PyramidLevelKey[] = ["LEADER", "TEAMLEITER", "SENIOR", "BERATER"];

const byName = new Intl.Collator("de", { sensitivity: "base" });

/**
 * Wer auf welcher Stufe steht: oben die Geschaeftsfuehrung, darunter
 * Teamleiter, Senior Berater und als breite Basis die Berater. Nur aktive
 * Leute; jede Stufe kommt vor, auch wenn sie noch leer ist - man sieht, wohin
 * es geht. Innerhalb einer Stufe nach Namen, nicht nach Leistung: die steht
 * in der Rangliste.
 */
export function buildPyramid(members: PyramidMember[]): PyramidLevel[] {
  const active = members.filter((member) => member.active);
  const team = new Map<number, number>();
  for (const member of active) {
    if (member.manager_id === null || member.manager_id === member.id) continue;
    team.set(member.manager_id, (team.get(member.manager_id) ?? 0) + 1);
  }
  return PYRAMID_ORDER.map((key) => ({
    key,
    label: key === "LEADER" ? "Geschäftsführung" : TIER_LABEL[key],
    people: active
      .filter((member) => (member.role === "LEADER" ? "LEADER" : member.tier) === key)
      .sort((a, b) => byName.compare(a.name, b.name) || a.id - b.id)
      .map((member) => ({
        id: member.id,
        name: member.name,
        avatar: member.avatar,
        team: canLeadTeam(member) ? team.get(member.id) ?? 0 : 0,
      })),
  }));
}
