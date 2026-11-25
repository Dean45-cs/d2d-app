import { requireUser } from "@/lib/auth";
import { handle, ValidationError } from "@/lib/api";
import { saveCommissionSettings } from "@/lib/commissions/store";
import { saveRank } from "@/lib/ranks";
import { isTier } from "@/lib/tiers";

export const dynamic = "force-dynamic";

const PERCENT_KEY = { BERATER: "standardPercent", SENIOR: "seniorPercent", JUNIOR_LEAD: "juniorPercent", TEAMLEITER: "leadPercent" } as const;

/** Name, Team-Schalter und Satz eines Rangs. Der Satz laeuft ueber die Provisionsregeln (Recht "Provisionen verwalten"). */
export async function PATCH(request: Request, { params }: { params: Promise<{ tier: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { tier } = await params;
    if (!isTier(tier)) throw new ValidationError("Unbekannter Rang.");
    const body = (await request.json()) ?? {};
    if (body.label !== undefined || body.team !== undefined) saveRank(user, tier, { label: body.label, team: body.team });
    if (body.percent !== undefined) {
      if (tier === "BERATER" && (body.percent === null || body.percent === "")) throw new ValidationError("Der Einstieg braucht einen Satz.");
      saveCommissionSettings(user, { [PERCENT_KEY[tier]]: body.percent });
    }
    return { ok: true };
  });
}
