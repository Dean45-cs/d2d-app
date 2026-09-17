import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMembers, listTerritories } from "@/lib/queries";
import { readArea } from "@/lib/geo/area";
import { mapTileUrl } from "@/lib/map";
import { EmptyState, PageHeader, ProgressBar, StatusBadge, percent } from "@/components/ui";
import { NewTerritoryButton } from "./NewTerritory";
import { TerritoryOverviewMap, type OverviewTerritory } from "./TerritoryOverviewMap";

export const dynamic = "force-dynamic";

export default async function TerritoriesPage() {
  const user = await requireUser();
  const isLeader = user.role === "LEADER";

  const territories = listTerritories(user.team_id, {
    userId: isLeader ? undefined : user.id,
  });
  const members = isLeader ? listMembers(user.team_id) : [];
  const tileUrl = mapTileUrl();

  // Nur Gebiete mit gezeichneter Flaeche kommen auf die Uebersichtskarte.
  const mapped: OverviewTerritory[] = territories.flatMap((t) => {
    const area = readArea(t.area_json);
    return area
      ? [
          {
            id: t.id,
            name: t.name,
            area,
            status: t.status,
            assignee: t.assignee_name,
            streets: t.street_count,
          },
        ]
      : [];
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={isLeader ? "Gebiete" : "Meine Gebiete"}
        subtitle={
          isLeader
            ? "Gebiet auf der Karte abstecken, Straßen automatisch laden und zuteilen"
            : "Deine zugeteilten Straßen und dein Fortschritt"
        }
        action={
          isLeader ? (
            <NewTerritoryButton
              members={members}
              tileUrl={tileUrl}
              existingAreas={mapped.map((t) => ({ id: t.id, name: t.name, area: t.area }))}
            />
          ) : undefined
        }
      />

      <TerritoryOverviewMap tileUrl={tileUrl} territories={mapped} />

      {territories.length === 0 ? (
        <EmptyState
          title={isLeader ? "Noch keine Gebiete" : "Dir ist noch kein Gebiet zugeteilt"}
          text={
            isLeader
              ? "Neues Gebiet anlegen, auf der Karte einkreisen – die Straßen holt die App aus OpenStreetMap."
              : "Sobald deine Teamleitung dir ein Gebiet zuweist, erscheint es hier."
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {territories.map((t) => {
            // Sind Wohneinheiten hinterlegt, ist das der Nenner; sonst zeigt der
            // Balken nur, dass ueberhaupt gearbeitet wurde.
            const goal = t.unit_count > 0 ? t.unit_count : Math.max(t.visit_count, 1);
            return (
              <Link
                key={t.id}
                href={`/gebiete/${t.id}`}
                className="card block p-4 transition hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{t.name}</p>
                    <p className="muted truncate text-xs">
                      {[t.postal_code, t.city].filter(Boolean).join(" ") || "Ohne Ortsangabe"}
                      {" · "}
                      {t.street_count} Straßen
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>

                <div className="mb-2">
                  <ProgressBar value={t.visit_count} max={goal} />
                </div>

                <div className="muted grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="block font-semibold text-[var(--ink)]">{t.visit_count}</span>
                    Türen
                  </div>
                  <div>
                    <span className="block font-semibold text-[var(--ink)]">{t.met_count}</span>
                    angetroffen
                  </div>
                  <div>
                    <span className="block font-semibold text-energy-600">{t.sale_count}</span>
                    Abschlüsse
                  </div>
                  <div>
                    <span className="block font-semibold text-[var(--ink)]">
                      {percent(t.sale_count, t.met_count)}
                    </span>
                    Quote
                  </div>
                </div>

                {isLeader && (
                  <p className="muted mt-3 border-t pt-2 text-xs hairline">
                    {t.assignee_name
                      ? `Zugeteilt an ${t.assignee_name}`
                      : "Noch niemandem zugeteilt"}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
