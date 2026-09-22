import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMembers, listTerritories } from "@/lib/queries";
import { readArea } from "@/lib/geo/area";
import { mapTileUrl } from "@/lib/map";
import {
  Avatar,
  EmptyState,
  PageHeader,
  ProgressBar,
  ProgressRing,
  StatusBadge,
  percent,
} from "@/components/ui";
import { IconChevronRight, IconMap } from "@/components/icons";
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
            doors: t.visit_count,
            units: t.unit_count,
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
          icon={<IconMap className="h-7 w-7" />}
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
            const share =
              t.unit_count > 0 ? Math.min(100, Math.round((t.visit_count / t.unit_count) * 100)) : null;
            return (
              <Link
                key={t.id}
                href={`/gebiete/${t.id}`}
                className="card block p-4 transition hover:shadow-lg active:scale-[0.99]"
              >
                <div className="mb-3 flex items-start gap-3">
                  {share !== null ? (
                    <ProgressRing
                      value={t.visit_count}
                      max={t.unit_count}
                      size={46}
                      tone={t.status === "DONE" ? "success" : "brand"}
                    >
                      {`${share}%`}
                    </ProgressRing>
                  ) : (
                    <span
                      className="tile-icon h-[46px] w-[46px] shrink-0"
                      style={{
                        background: "color-mix(in srgb, var(--brand-500) 12%, transparent)",
                        color: "var(--brand-600)",
                      }}
                      aria-hidden
                    >
                      <IconMap />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold">{t.name}</p>
                    <p className="muted truncate text-[12px]">
                      {[t.postal_code, t.city].filter(Boolean).join(" ") || "Ohne Ortsangabe"}
                      {" · "}
                      {t.street_count} Straßen
                    </p>
                    <div className="mt-1.5">
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                  <IconChevronRight className="mt-3 h-4 w-4 shrink-0 opacity-25" />
                </div>

                <ProgressBar
                  value={t.visit_count}
                  max={goal}
                  size="sm"
                  tone={t.status === "DONE" ? "success" : "brand"}
                />

                <div className="muted mt-2.5 grid grid-cols-4 gap-2 text-[11px]">
                  <div>
                    <span className="block text-[15px] font-bold tabular-nums text-[var(--ink)]">
                      {t.visit_count}
                    </span>
                    Türen
                  </div>
                  <div>
                    <span className="block text-[15px] font-bold tabular-nums text-[var(--ink)]">
                      {t.met_count}
                    </span>
                    angetroffen
                  </div>
                  <div>
                    <span className="block text-[15px] font-bold tabular-nums text-energy-600">
                      {t.sale_count}
                    </span>
                    Abschlüsse
                  </div>
                  <div>
                    <span className="block text-[15px] font-bold tabular-nums text-[var(--ink)]">
                      {percent(t.sale_count, t.met_count)}
                    </span>
                    Quote
                  </div>
                </div>

                {isLeader && (
                  <div
                    className="mt-3 flex items-center gap-2 border-t pt-2.5"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <Avatar name={t.assignee_name} size={26} tone={t.assignee_name ? "brand" : "muted"} />
                    <span className="muted truncate text-[12px]">
                      {t.assignee_name ? t.assignee_name : "Noch niemandem zugeteilt"}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
