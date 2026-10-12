import { hasPermission } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { feedConfig } from "@/lib/energy/adapters";
import { refreshEnergyPrices } from "@/lib/energy/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Taeglicher Abruf der Grundversorger-Preise aus der Tagesquelle - nur, wenn
 * eine eingerichtet ist (ENERGY_FEED_MODE/ENERGY_FEED_URL).
 *
 * Aufruf entweder
 *   - per Cron mit Header  Authorization: Bearer <ENERGY_REFRESH_TOKEN>
 *   - oder aus der App heraus durch die Teamleitung (Button "Jetzt aktualisieren").
 */
async function authorise(request: Request): Promise<200 | 401 | 403> {
  const token = process.env.ENERGY_REFRESH_TOKEN;
  const header = request.headers.get("authorization");
  if (token && header === `Bearer ${token}`) return 200;

  const user = await getCurrentUser();
  if (!user) return 401;
  return hasPermission(user, "energy.refresh") ? 200 : 403;
}

export async function POST(request: Request) {
  const authorization = await authorise(request);
  if (authorization !== 200) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: authorization });
  }
  if (!feedConfig()) {
    return NextResponse.json(
      { error: "Keine Tagesquelle eingerichtet – Preise werden direkt auf der Energiekarte eingetragen." },
      { status: 409 },
    );
  }
  const result = await refreshEnergyPrices();
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 502 });
}

// Manche Cron-Dienste koennen nur GET.
export async function GET(request: Request) {
  return POST(request);
}
