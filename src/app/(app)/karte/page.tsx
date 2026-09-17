import { requireUser } from "@/lib/auth";
import { lastRefresh, listEnergyPrices } from "@/lib/queries";
import {
  CONSUMPTION_GAS_KWH,
  CONSUMPTION_STROM_KWH,
  annualCost,
} from "@/lib/energy/refresh";
import { mapTileUrl } from "@/lib/map";
import { EnergyMapClient, type MapPoint } from "./EnergyMapClient";

export const dynamic = "force-dynamic";

export default async function EnergyMapPage() {
  const user = await requireUser();
  const rows = listEnergyPrices();

  const points: MapPoint[] = rows.map((p) => ({
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

  const refresh = lastRefresh();

  return (
    <EnergyMapClient
      points={points}
      refresh={refresh}
      isLeader={user.role === "LEADER"}
      consumption={{ strom: CONSUMPTION_STROM_KWH, gas: CONSUMPTION_GAS_KWH }}
      tileUrl={mapTileUrl()}
    />
  );
}
