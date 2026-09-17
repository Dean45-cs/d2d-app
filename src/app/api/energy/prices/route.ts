import { requireUser } from "@/lib/auth";
import { lastRefresh, listEnergyPrices } from "@/lib/queries";
import {
  CONSUMPTION_GAS_KWH,
  CONSUMPTION_STROM_KWH,
  annualCost,
} from "@/lib/energy/refresh";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const prices = listEnergyPrices().map((p) => ({
      ...p,
      strom_year_eur: annualCost(p.strom_ct_kwh, p.strom_base_eur, CONSUMPTION_STROM_KWH),
      gas_year_eur: annualCost(p.gas_ct_kwh, p.gas_base_eur, CONSUMPTION_GAS_KWH),
    }));
    return {
      prices,
      refresh: lastRefresh(),
      consumption: { strom: CONSUMPTION_STROM_KWH, gas: CONSUMPTION_GAS_KWH },
    };
  });
}
