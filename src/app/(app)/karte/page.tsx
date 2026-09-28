import { requireUser } from "@/lib/auth";
import { getTerritory, lastRefresh, listEnergyPrices } from "@/lib/queries";
import { centerOf, readArea } from "@/lib/geo/area";
import {
  CONSUMPTION_GAS_KWH,
  CONSUMPTION_STROM_KWH,
  annualCost,
} from "@/lib/energy/refresh";
import {
  getReference,
  isStale,
  listManualPrices,
  monthly,
  referenceYear,
} from "@/lib/energy/manual";
import { openPlaces } from "@/lib/energy/places";
import { feedConfig } from "@/lib/energy/adapters";
import { findCity } from "@/lib/energy/cities";
import { EnergyMapClient } from "./EnergyMapClient";
import {
  EMPTY_DRAFT,
  draftFromOpen,
  draftFromPoint,
  type MapPoint,
  type OpenPoint,
  type PriceDraft,
} from "./data";

export const dynamic = "force-dynamic";

export default async function EnergyMapPage({
  searchParams,
}: {
  searchParams: Promise<{ gebiet?: string }>;
}) {
  const user = await requireUser();
  const isLeader = user.role === "LEADER";

  // Eigene Preise ersetzen den Wert der Tagesquelle fuer dieselbe PLZ.
  const manual = listManualPrices(user.team_id);
  const own = new Set(manual.map((m) => m.postal_code));

  const ownPoints: MapPoint[] = manual.map((m) => ({
    key: `p:${m.postal_code}`,
    id: m.id,
    plz: m.postal_code,
    city: m.city,
    provider: m.provider,
    gasProvider: m.gas_provider,
    lat: m.lat,
    lng: m.lng,
    stromCt: m.strom_ct_kwh,
    stromBaseMonth: monthly(m.strom_base_eur),
    gasCt: m.gas_ct_kwh,
    gasBaseMonth: monthly(m.gas_base_eur),
    stromYear: annualCost(m.strom_ct_kwh, m.strom_base_eur, CONSUMPTION_STROM_KWH),
    gasYear: annualCost(m.gas_ct_kwh, m.gas_base_eur, CONSUMPTION_GAS_KWH),
    validFrom: m.valid_from,
    sourceUrl: m.source_url,
    stale: isStale(m.updated_at),
  }));

  const feedPoints: MapPoint[] = listEnergyPrices()
    .filter((p) => !own.has(p.postal_code))
    .map((p) => ({
      key: `f:${p.postal_code}`,
      id: null,
      plz: p.postal_code,
      city: p.city,
      provider: p.provider,
      gasProvider: "",
      lat: p.lat,
      lng: p.lng,
      stromCt: p.strom_ct_kwh,
      stromBaseMonth: monthly(p.strom_base_eur),
      gasCt: p.gas_ct_kwh,
      gasBaseMonth: monthly(p.gas_base_eur),
      stromYear: annualCost(p.strom_ct_kwh, p.strom_base_eur, CONSUMPTION_STROM_KWH),
      gasYear: annualCost(p.gas_ct_kwh, p.gas_base_eur, CONSUMPTION_GAS_KWH),
      validFrom: p.valid_from ?? "",
      sourceUrl: "",
      stale: false,
    }));

  // Orte der eigenen Gebiete ohne Preis - nur die Teamleitung kann sie fuellen.
  const open: OpenPoint[] = isLeader
    ? openPlaces(user.team_id).map((place) => ({
        key: `o:${place.key}`,
        plz: place.postal_code,
        city: place.city,
        territories: place.territories.map((t) => t.name),
        lat: place.lat,
        lng: place.lng,
        provider: place.provider,
      }))
    : [];

  // Aus einem Gebiet heraus "Preis eintragen": Formular gleich vorbelegt oeffnen.
  const { gebiet } = await searchParams;
  let initialDraft: PriceDraft | null = null;
  const territoryId = Number(gebiet);
  if (isLeader && Number.isInteger(territoryId) && territoryId > 0) {
    const territory = getTerritory(territoryId, user.team_id);
    if (territory) {
      const existing = [...ownPoints, ...feedPoints].find(
        (p) => territory.postal_code !== "" && p.plz === territory.postal_code,
      );
      const place = open.find(
        (p) => p.plz === territory.postal_code && p.territories.includes(territory.name),
      );
      const area = readArea(territory.area_json);
      const center = area ? centerOf(area) : null;
      initialDraft = existing
        ? draftFromPoint(existing)
        : place
          ? draftFromOpen(place)
          : {
              ...EMPTY_DRAFT,
              postalCode: territory.postal_code,
              city: territory.city,
              provider: findCity(territory.postal_code, territory.city)?.provider ?? "",
              lat: center?.[0] ?? null,
              lng: center?.[1] ?? null,
            };
    }
  }

  const feed = feedConfig();
  const reference = referenceYear(getReference(user.team_id));

  return (
    <EnergyMapClient
      prices={[...ownPoints, ...feedPoints]}
      open={open}
      reference={reference}
      isLeader={isLeader}
      feed={feed ? { refresh: lastRefresh() } : null}
      consumption={{ strom: CONSUMPTION_STROM_KWH, gas: CONSUMPTION_GAS_KWH }}
      initialDraft={initialDraft}
    />
  );
}
