import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { lastRefresh, listReasons, listTerritories } from "@/lib/queries";
import { PageHeader, SectionHeader } from "@/components/ui";
import { IconExternal } from "@/components/icons";
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

  const tarifrechnerHost = hostOf(tarifrechner);
  const lastRun = refresh?.finished_at
    ? new Date(refresh.finished_at).toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Noch nie";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Einstellungen" />

      <div className="space-y-4">
        <div id="grundversorger" className="scroll-mt-20">
          <ProviderPriceSettings
            prices={prices}
            missing={[...missingByPlace.values()]}
            reference={getReference(user.team_id)}
            referenceDefault={DEFAULT_REFERENCE}
          />
        </div>

        <ReasonSettings reasons={reasons} />

        <section className="card p-5">
          <SectionHeader title="Abschluss" className="mb-1" />
          <p className="muted mb-4 text-[13px] leading-snug">
            Der Abschluss-Knopf an der Tür öffnet den Tarifrechner des Partners, in dem der
            Auftrag aufgenommen und unterschrieben wird.
          </p>
          <div className="list">
            <a
              href={tarifrechner}
              target="_blank"
              rel="noreferrer"
              className="list-row"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium">Tarifrechner</span>
                <span className="muted block truncate text-[12.5px]">{tarifrechnerHost}</span>
              </span>
              <IconExternal className="muted h-4 w-4 shrink-0" />
            </a>
          </div>
        </section>

        <section className="card p-5">
          <SectionHeader title="Preisdaten der Energiekarte" className="mb-3" />
          <dl className="list">
            <InfoRow
              label="Quelle"
              value={
                feedMode === "seed"
                  ? "Beispieldaten"
                  : refresh?.source || feedMode.toUpperCase()
              }
            />
            <InfoRow label="Letzter Abruf" value={lastRun} />
            <InfoRow
              label="Status"
              value={
                !refresh
                  ? "–"
                  : refresh.status === "ok"
                    ? `Aktuell · ${refresh.row_count} Orte`
                    : "Fehlgeschlagen"
              }
              tone={refresh && refresh.status !== "ok" ? "danger" : undefined}
            />
          </dl>
          {feedMode === "seed" && (
            <p className="muted mt-3 text-[12.5px] leading-snug">
              Die Energiekarte zeigt Beispielwerte, bis eine Tagesquelle angebunden ist. Echte
              Preise für eure Orte lassen sich oben unter Grundversorger-Preise eintragen.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-3 text-[14px]">
      <dt className="muted">{label}</dt>
      <dd
        className="min-w-0 truncate text-right font-medium"
        style={{ color: tone === "danger" ? "var(--danger-ink)" : undefined }}
      >
        {value}
      </dd>
    </div>
  );
}

/** "portal-ep24.de" aus der vollen Adresse - lesbarer als der ganze Pfad. */
function hostOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}
