import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { lastRefresh, listReasons } from "@/lib/queries";
import { PageHeader, SectionHeader } from "@/components/ui";
import { IconChevronRight, IconExternal } from "@/components/icons";
import { feedConfig } from "@/lib/energy/adapters";
import { openPlaces } from "@/lib/energy/places";
import {
  DEFAULT_REFERENCE,
  getReference,
  isStale,
  listManualPrices,
} from "@/lib/energy/manual";
import { ReasonSettings } from "./ReasonSettings";
import { ReferenceSettings } from "./ReferenceSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "LEADER") redirect("/tour");

  const reasons = listReasons(user.team_id, false);
  const feed = feedConfig();
  const refresh = feed ? lastRefresh() : null;

  // Grundversorger-Preise: gepflegt wird auf der Energiekarte, hier nur der Stand.
  const prices = listManualPrices(user.team_id);
  const stale = prices.filter((row) => isStale(row.updated_at)).length;
  const open = openPlaces(user.team_id).length;

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
        <section id="grundversorger" className="card scroll-mt-20 p-5">
          <SectionHeader title="Grundversorger-Preise" className="mb-1" />
          <p className="muted mb-4 text-[13px] leading-snug">
            Eingetragen wird direkt auf der Energiekarte – einzeln vom Preisblatt oder viele Orte
            auf einmal als Tabelle.
          </p>
          <div className="list">
            <Link href="/karte" className="list-row">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium">Energiekarte</span>
                <span className="muted block truncate text-[12.5px]">
                  {[
                    `${prices.length} ${prices.length === 1 ? "Ort" : "Orte"} eingetragen`,
                    open > 0 && `${open} Gebietsorte ohne Preis`,
                    stale > 0 && `${stale} bitte prüfen`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <IconChevronRight className="muted h-4 w-4 shrink-0" />
            </Link>
          </div>
          <ReferenceSettings
            reference={getReference(user.team_id)}
            referenceDefault={DEFAULT_REFERENCE}
          />
        </section>

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

        {feed && (
          <section className="card p-5">
            <SectionHeader title="Tagesquelle der Energiekarte" className="mb-3" />
            <dl className="list">
              <InfoRow label="Quelle" value={refresh?.source || feed.label || hostOf(feed.url)} />
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
            <p className="muted mt-3 text-[12.5px] leading-snug">
              Selbst eingetragene Preise gehen der Tagesquelle vor.
            </p>
          </section>
        )}
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
