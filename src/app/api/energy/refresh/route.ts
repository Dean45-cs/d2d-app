import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { refreshEnergyPrices } from "@/lib/energy/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Taeglicher Abruf der Grundversorger-Preise.
 *
 * Aufruf entweder
 *   - per Cron mit Header  Authorization: Bearer <ENERGY_REFRESH_TOKEN>
 *   - oder aus der App heraus durch die Teamleitung (Button "Jetzt aktualisieren").
 */
async function authorise(request: Request): Promise<boolean> {
  const token = process.env.ENERGY_REFRESH_TOKEN;
  const header = request.headers.get("authorization");
  if (token && header === `Bearer ${token}`) return true;

  const user = await getCurrentUser();
  return user?.role === "LEADER";
}

export async function POST(request: Request) {
  if (!(await authorise(request))) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 401 });
  }
  const result = await refreshEnergyPrices();
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 502 });
}

// Manche Cron-Dienste koennen nur GET.
export async function GET(request: Request) {
  return POST(request);
}
