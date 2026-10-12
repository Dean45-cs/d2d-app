import { hasPermission } from "@/lib/permissions";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { listVisits } from "@/lib/queries";
import { handle, optionalNumber } from "@/lib/api";
import { notifySale } from "@/lib/push";
import { recordVisit } from "@/lib/record-visit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json();
    const result = recordVisit(user, body);
    if (body.outcome === "SALE" && !result.replayed && result.id !== null) {
      const visitId = result.id;
      after(() => notifySale(visitId).catch((error) => console.warn("[push] Abschluss:", error)));
    }
    return { ok: true, ...result };
  });
}

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(request.url);
    const territoryId = optionalNumber(url.searchParams.get("territoryId"));
    return {
      visits: listVisits(user.team_id, {
        userId: hasPermission(user, "reports.team") ? undefined : user.id,
        territoryId: territoryId ?? undefined,
        limit: 50,
      }),
    };
  });
}
