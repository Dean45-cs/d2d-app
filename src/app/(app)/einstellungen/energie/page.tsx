import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { lastRefresh } from "@/lib/queries";
import { feedConfig } from "@/lib/energy/adapters";
import { openPlaces } from "@/lib/energy/places";
import { DEFAULT_REFERENCE, getReference, isStale, listManualPrices } from "@/lib/energy/manual";
import { Cell, InlineError, ListLabel, PageHeader, Pill, plural } from "@/components/ui";
import { IconBolt, IconTarget } from "@/components/icons";
import { FeedRefreshCell } from "./FeedRefreshCell";
import { ReferenceSettings } from "./ReferenceSettings";

export const dynamic = "force-dynamic";

/**
 * Energie & Tarif: woran Preise gemessen werden (Bundesschnitt), woher sie
 * taeglich kommen (Tagesquelle) und wohin der Abschluss fuehrt (Tarifrechner).
 * Gepflegt werden die Preise selbst auf der Karte.
 */
export default async function EnergySettingsPage() {
  const user = await requireUser();
  const rights = permissionsFor(user);
  if (!rights["energy.reference"] && !rights["energy.manage"] && !rights["energy.refresh"]) redirect("/profil");

  const feed = feedConfig();
  const refresh = feed ? lastRefresh() : null;

  const prices = listManualPrices(user.team_id);
  const stale = prices.filter((row) => isStale(row.updated_at)).length;
  const open = openPlaces(user.team_id).length;

  const tarifrechner =
    process.env.NEXT_PUBLIC_TARIFRECHNER_URL ??
    "https://portal-ep24.de/menues/tarifrechner/";

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
  const failed = refresh !== null && refresh.status === "error";
  const status = !refresh ? "–" : refresh.status === "ok" ? "Aktuell" : refresh.status === "running" ? "Läuft" : "Fehlgeschlagen";

  const main = rights["energy.reference"] || feed;

  const tools = (
    <section>
      <ListLabel>Werkzeuge</ListLabel>
      <ul className="list list-icons">
        <li>
          <Cell
            href="/karte"
            icon={
              <span className="glyph">
                <IconBolt className="h-4 w-4" />
              </span>
            }
            title="Preise auf der Karte"
            subtitle={open > 0 ? `${open} Gebietsorte ohne Preis` : plural(prices.length, "Ort", "Orte")}
            trailing={stale > 0 ? <Pill tone="warn">{stale} prüfen</Pill> : undefined}
          />
        </li>
        <li>
          <Cell
            href={tarifrechner}
            external
            icon={
              <span className="glyph">
                <IconTarget className="h-4 w-4" />
              </span>
            }
            title="Tarifrechner"
            subtitle={hostOf(tarifrechner)}
          />
        </li>
      </ul>
    </section>
  );

  return (
    <div className="page-medium">
      <PageHeader
        back={{ href: "/profil", label: "Profil" }}
        title="Energie & Tarif"
        subtitle={prices.length > 0 ? `${plural(prices.length, "Ort", "Orte")} mit Preis` : "Noch keine Preise"}
      />

      {main ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-8">
          <div className="space-y-6">
            {rights["energy.reference"] && (
              <ReferenceSettings reference={getReference(user.team_id)} referenceDefault={DEFAULT_REFERENCE} />
            )}

            {feed && (
              <section>
                <ListLabel>Tagesquelle</ListLabel>
                <ul className="list">
                  <li>
                    <Cell title="Quelle" detail={<span className="block max-w-48 truncate sm:max-w-xs">{refresh?.source || feed.label || hostOf(feed.url)}</span>} />
                  </li>
                  <li>
                    <Cell title="Letzter Abruf" detail={lastRun} />
                  </li>
                  {refresh?.status === "ok" && (
                    <li>
                      <Cell title="Orte" detail={refresh.row_count.toLocaleString("de-DE")} />
                    </li>
                  )}
                  <li>
                    <Cell
                      title="Status"
                      detail={failed ? <span className="font-semibold text-danger">{status}</span> : status}
                    />
                  </li>
                  {rights["energy.refresh"] && <FeedRefreshCell />}
                </ul>
                {failed && refresh?.message && (
                  <div className="mt-3">
                    <InlineError>{refresh.message}</InlineError>
                  </div>
                )}
                <p className="list-footer">Eigene Preise gehen der Tagesquelle vor.</p>
              </section>
            )}
          </div>
          {tools}
        </div>
      ) : (
        tools
      )}
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
