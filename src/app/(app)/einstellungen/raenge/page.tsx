import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { permissionsFor } from "@/lib/permissions";
import { loadSettings } from "@/lib/commissions/store";
import { TIER_PERCENT_FIELD, tierPercents } from "@/lib/commissions/model";
import { loadGoals, loadRanks } from "@/lib/ranks";
import { TIERS } from "@/lib/tiers";
import type { Tier } from "@/lib/types";
import { RankSettings, type RankRow } from "./RankSettings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ränge" };

/**
 * Raenge einstellen: Name, Satz, Team-Schalter und Ziele je Rang. Nur die
 * Geschaeftsfuehrung mit "Rollen und Stufen aendern"; den Satz aendert nur,
 * wer auch Provisionen verwalten darf.
 */
export default async function RankSettingsPage() {
  const user = await requireUser();
  const rights = permissionsFor(user);
  if (user.role !== "LEADER" || !rights["team.roles"]) redirect("/profil");
  const ranks = loadRanks(user.team_id);
  const settings = loadSettings(user.team_id);
  const percents = tierPercents(settings);
  const goals = loadGoals(user.team_id);
  const counts = new Map(
    (getDb()
      .prepare("SELECT tier, COUNT(*) AS n FROM users WHERE team_id = ? AND role = 'MEMBER' AND active = 1 GROUP BY tier")
      .all(user.team_id) as Array<{ tier: Tier; n: number }>).map((row) => [row.tier, row.n]),
  );
  const rows: RankRow[] = TIERS.map((tier) => ({
    tier,
    label: ranks[tier].label,
    team: ranks[tier].team,
    stored: settings[TIER_PERCENT_FIELD[tier]],
    percent: percents?.[tier] ?? null,
    people: counts.get(tier) ?? 0,
    goals: goals.filter((goal) => goal.tier === tier),
  }));
  return <RankSettings rows={rows} ranks={ranks} canEditPercent={rights["commissions.manage"]} />;
}
