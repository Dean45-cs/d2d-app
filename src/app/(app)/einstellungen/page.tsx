import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { lastRefresh, listReasons, listTerritories } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { centerOf, readArea } from "@/lib/geo/area";
import { providerLookup } from "@/lib/energy/provider";
import {
  DEFAULT_REFERENCE,
  getReference,
  listManualPrices,
  STALE_AFTER_DAYS,
} from "@/lib/energy/manual";
import { ReasonSettings } from "./ReasonSettings";
import { ProviderPriceSettings, type Missing, type PriceRow } from "./ProviderPriceSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "LEADER") redirect("/tour");

  const reasons = listReasons(user.team_id, false);
  const refresh = lastRefresh();
  const feedMode = process.env.ENERGY_FEED_MODE ?? "seed";
  // Grundversorger-Preise: was schon eingetragen ist, und welche Orte der
  // eigenen Gebiete noch ohne echten Preis dastehen.
  const now = Date.now();
  const prices: PriceRow[] = listManualPrices(user.team_id).map((row) => ({
    id: row.id,
    postal_code: row.postal_code,
    city: row.city,
    provider: row.provider,
    gas_provider: row.gas_provider,
    lat: row.lat,
    lng: row.lng,
    strom_ct_kwh: row.strom_ct_kwh,
    strom_base_month: row.strom_base_eur === null ? null : Math.round((row.strom_base_eur / 12) * 100) / 100,
    gas_ct_kwh: row.gas_ct_kwh,
    gas_base_month: row.gas_base_eur === null ? null : Math.round((row.gas_base_eur / 12) * 100) / 100,
    valid_from: row.valid_from,
    source_url: row.source_url,
    updated_at: row.updated_at,
    stale: now - Date.parse(`${row.updated_at.replace(" ", "T")}Z`) > STALE_AFTER_DAYS * 86_400_000,
  }));

  const lookup = providerLookup(user.team_id);
  const missingByPlace = new Map<string, Missing>();
  for (const territory of listTerritories(user.team_id)) {
    if (territory.status === "DONE") continue;
    const area = readArea(territory.area_json);
    const info = lookup.find({ postal_code: territory.postal_code, city: territory.city, area });
    if (info?.manual && (info.match === "plz" || info.match === "city")) continue;
    const key = territory.postal_code || territory.city.toLowerCase();
    const known = missingByPlace.get(key);
    if (known) {
      known.territories.push(territory.name);
      continue;
    }
    const center = area ? centerOf(area) : null;
    missingByPlace.set(key, {
      postal_code: territory.postal_code,
      city: territory.city,
      territories: [territory.name],
      lat: center?.[0] ?? null,
      lng: center?.[1] ?? null,
      // Name aus der Staedteliste nur, wenn der Ort wirklich passt.
      provider: info && (info.match === "plz" || info.match === "city") ? info.provider : "",
    });
  }

  const tarifrechner =
    process.env.NEXT_PUBLIC_TARIFRECHNER_URL ??
    "https://portal-ep24.de/menues/tarifrechner/";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Einstellungen"
        subtitle="Grundversorger-Preise, Ablehnungsgründe, Partner-Link und Datenquelle"
      />

      <div id="grundversorger" className="-mt-4 scroll-mt-20">
        <ProviderPriceSettings
          prices={prices}
          missing={[...missingByPlace.values()]}
          reference={getReference(user.team_id)}
          referenceDefault={DEFAULT_REFERENCE}
        />
      </div>

      <div className="mt-4">
        <ReasonSettings reasons={reasons} />
      </div>

      <section className="card mt-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">Auftragserfassung des Partners</h2>
        <p className="muted mb-2 text-sm">
          Der Abschluss-Button im Tür-Tracking öffnet diese Adresse:
        </p>
        <code className="block overflow-x-auto rounded-xl bg-black/5 px-3 py-2 text-xs">
          {tarifrechner}
        </code>
        <p className="muted mt-2 text-xs">
          Änderbar über <code>NEXT_PUBLIC_TARIFRECHNER_URL</code> in der Datei{" "}
          <code>.env.local</code>.
        </p>
      </section>

      <section className="card mt-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">Energiekarte – Datenquelle</h2>
        <dl className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="muted">Modus</dt>
            <dd className="font-semibold">
              {feedMode === "seed" ? "Demo-Daten (keine echten Tarife)" : feedMode.toUpperCase()}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="muted">Letzter Abruf</dt>
            <dd className="font-semibold">
              {refresh?.finished_at
                ? new Date(refresh.finished_at).toLocaleString("de-DE")
                : "noch nie"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="muted">Ergebnis</dt>
            <dd className="font-semibold">
              {refresh ? `${refresh.status} · ${refresh.row_count} PLZ` : "–"}
            </dd>
          </div>
        </dl>
        <p className="muted mt-3 text-xs">
          Für echte Tagespreise <code>ENERGY_FEED_MODE=csv</code> (oder <code>json</code>)
          und <code>ENERGY_FEED_URL</code> in <code>.env.local</code> setzen. Das erwartete
          Format steht im README unter „Energiekarte“.
        </p>
      </section>

      <section className="card mt-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">Farben &amp; Logo</h2>
        <p className="muted text-sm">
          Alle Farben der App stehen in <code>src/app/brand.css</code>. Dort die
          Hex-Werte von Energie Partner 24 eintragen, dann übernimmt die gesamte
          Oberfläche sie. Ein eigenes Logo als <code>public/logo.svg</code> ablegen
          und in <code>src/components/Logo.tsx</code> einbinden.
        </p>
      </section>
    </div>
  );
}
