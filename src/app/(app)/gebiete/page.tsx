import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMembers, listTerritories } from "@/lib/queries";
import { readArea, readShape } from "@/lib/geo/area";
import { providerLookup } from "@/lib/energy/provider";
import { ProviderLine } from "@/components/ProviderRating";
import {
  Avatar,
  EmptyState,
  PageHeader,
  ProgressBar,
  ProgressRing,
  StatusBadge,
  percent,
  plural,
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
  const providers = providerLookup(user.team_id);

  // Nur Gebiete mit gezeichneter Flaeche kommen auf die Uebersichtskarte.
  const mapped: OverviewTerritory[] = territories.flatMap((t) => {
    const area = readShape(t.area_json);
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

  const inWork = territories.filter((t) => t.status === "ACTIVE").length;
  const unassigned = territories.filter((t) => !t.assigned_user_id).length;
  const summary =
    territories.length === 0
      ? undefined
      : [
          plural(territories.length, "Gebiet", "Gebiete"),
          inWork > 0 && `${inWork} in Arbeit`,
          isLeader && unassigned > 0 && `${unassigned} ohne Zuteilung`,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={isLeader ? "Gebiete" : "Meine Gebiete"}
        subtitle={summary}
        action={
          isLeader ? (
            <NewTerritoryButton
              members={members}
              existingAreas={mapped.map((t) => ({ id: t.id, name: t.name, area: t.area }))}
            />
          ) : undefined
        }
      />

      <TerritoryOverviewMap territories={mapped} />

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
              <Link key={t.id} href={`/gebiete/${t.id}`} className="card block p-4">
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
                        color: "var(--tint)",
                      }}
                      aria-hidden
                    >
                      <IconMap />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold tracking-[-0.01em]">{t.name}</p>
                    <p className="muted truncate text-[12.5px]">
                      {[t.postal_code, t.city].filter(Boolean).join(" ") || "Ohne Ortsangabe"}
                      {" · "}
                      {plural(t.street_count, "Straße", "Straßen")}
                    </p>
                    <div className="mt-1.5">
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                  <IconChevronRight className="muted mt-3 h-4 w-4 shrink-0 opacity-50" />
                </div>

                <ProviderLine
                  info={providers.find({
                    postal_code: t.postal_code,
                    city: t.city,
                    area: readArea(t.area_json),
                  })}
                  className="mb-3 rounded-[var(--r-sm)] bg-[var(--card-inset)] px-2.5 py-2"
                />

                <ProgressBar
                  value={t.visit_count}
                  max={goal}
                  size="sm"
                  tone={t.status === "DONE" ? "success" : "brand"}
                />

                <dl className="mt-3 grid grid-cols-4 gap-2">
                  <Figure label="Türen" value={t.visit_count} />
                  <Figure label="Angetroffen" value={t.met_count} />
                  <Figure label="Abschlüsse" value={t.sale_count} tone="success" />
                  <Figure label="Quote" value={percent(t.sale_count, t.met_count)} />
                </dl>

                {isLeader && (
                  <div
                    className="mt-3 flex items-center gap-2 border-t pt-2.5"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <Avatar name={t.assignee_name} size={26} tone={t.assignee_name ? "brand" : "muted"} />
                    <span
                      className={`truncate text-[12.5px] ${t.assignee_name ? "muted" : "font-medium text-warn"}`}
                    >
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

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "success";
}) {
  return (
    // Beschriftung zuerst im Quelltext (so will es <dl>), die Zahl steht optisch oben.
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="muted truncate text-[11.5px]">{label}</dt>
      <dd
        className="text-[16px] font-bold leading-tight tabular-nums"
        style={{ color: tone === "success" && value ? "var(--ok-ink)" : "var(--ink)" }}
      >
        {value}
      </dd>
    </div>
  );
}
