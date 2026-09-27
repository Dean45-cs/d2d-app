import { requireUser } from "@/lib/auth";
import { lastRefresh, listEnergyPrices } from "@/lib/queries";
import {
  CONSUMPTION_GAS_KWH,
  CONSUMPTION_STROM_KWH,
  annualCost,
} from "@/lib/energy/refresh";
import { listManualPrices } from "@/lib/energy/manual";
import { EnergyMapClient, type MapPoint } from "./EnergyMapClient";

export const dynamic = "force-dynamic";

export default async function EnergyMapPage() {
  const user = await requireUser();
  const rows = listEnergyPrices();

  // Selbst gepflegte Preise ersetzen den Wert der Tagesquelle fuer dieselbe PLZ.
  const manual = listManualPrices(user.team_id).filter((m) => m.lat !== null && m.lng !== null);
  const own = new Set(manual.map((m) => m.postal_code));

  const manualPoints: MapPoint[] = manual.map((m) => ({
    plz: m.postal_code,
    city: m.city,
    state: "eigene Eingabe",
    provider: m.provider,
    lat: m.lat!,
    lng: m.lng!,
    stromCt: m.strom_ct_kwh,
    gasCt: m.gas_ct_kwh,
    stromYear: annualCost(m.strom_ct_kwh, m.strom_base_eur, CONSUMPTION_STROM_KWH),
    gasYear: annualCost(m.gas_ct_kwh, m.gas_base_eur, CONSUMPTION_GAS_KWH),
    isDemo: false,
  }));

  const feedPoints: MapPoint[] = rows.filter((p) => !own.has(p.postal_code)).map((p) => ({
    plz: p.postal_code,
    city: p.city,
    state: p.state,
    provider: p.provider,
    lat: p.lat,
    lng: p.lng,
    stromCt: p.strom_ct_kwh,
    gasCt: p.gas_ct_kwh,
    stromYear: annualCost(p.strom_ct_kwh, p.strom_base_eur, CONSUMPTION_STROM_KWH),
    gasYear: annualCost(p.gas_ct_kwh, p.gas_base_eur, CONSUMPTION_GAS_KWH),
    isDemo: p.is_demo === 1,
  }));
  const points = [...manualPoints, ...feedPoints];

  const refresh = lastRefresh();

  return (
    <EnergyMapClient
      points={points}
      refresh={refresh}
      isLeader={user.role === "LEADER"}
      consumption={{ strom: CONSUMPTION_STROM_KWH, gas: CONSUMPTION_GAS_KWH }}
    />
  );
}
