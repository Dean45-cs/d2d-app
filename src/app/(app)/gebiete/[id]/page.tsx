import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getTerritory,
  listMembers,
  listStreets,
  listTerritories,
  listVisits,
  type StreetWithStats,
} from "@/lib/queries";
import { readArea } from "@/lib/geo/area";
import { mapTileUrl } from "@/lib/map";
import { PageHeader, ProgressBar, StatusBadge, percent } from "@/components/ui";
import { TerritoryControls } from "./TerritoryControls";
import { TerritoryAreaCard } from "./TerritoryAreaCard";
import { StreetList } from "./StreetList";

export const dynamic = "force-dynamic";

export default async function TerritoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const territory = getTerritory(Number(id), user.team_id);
  if (!territory) notFound();

  const isLeader = user.role === "LEADER";
  if (!isLeader && territory.assigned_user_id !== user.id) notFound();

  const streets = listStreets(territory.id);
  const members = isLeader ? listMembers(user.team_id) : [];
  const visits = listVisits(user.team_id, { territoryId: territory.id, limit: 30 });

  const area = readArea(territory.area_json);
  // Beim Nachziehen der Flaeche sollen die Nachbargebiete sichtbar sein.
  const otherAreas = isLeader
    ? listTerritories(user.team_id).flatMap((t) => {
        const other = t.id === territory.id ? null : readArea(t.area_json);
        return other ? [{ id: t.id, name: t.name, area: other }] : [];
      })
    : [];

  // Jede Strasse wird auf der Karte nach ihrem Stand eingefaerbt.
  const pins = streets.flatMap((street) =>
    street.lat !== null && street.lng !== null
      ? [
          {
            name: street.name,
            lat: street.lat,
            lng: street.lng,
            state: streetState(street),
            hint: [
              street.house_numbers && `Nr. ${street.house_numbers}`,
              street.units > 0
                ? `${street.visit_count} von ${street.units} Türen`
                : `${street.visit_count} Türen erfasst`,
              street.sale_count > 0 && `${street.sale_count} Abschlüsse`,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        ]
      : [],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/gebiete" className="muted mb-2 inline-block text-sm font-semibold">
        ← Alle Gebiete
      </Link>

      <PageHeader
        title={territory.name}
        subtitle={
          [territory.postal_code, territory.city].filter(Boolean).join(" ") ||
          "Ohne Ortsangabe"
        }
        action={<StatusBadge status={territory.status} />}
      />

      <div className="card mb-4 p-4">
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Straßen" value={territory.street_count} />
          <Metric label="Türen erfasst" value={territory.visit_count} />
          <Metric label="Angetroffen" value={territory.met_count} />
          <Metric
            label="Abschlüsse"
            value={territory.sale_count}
            hint={percent(territory.sale_count, territory.met_count)}
          />
        </div>
        {territory.unit_count > 0 && (
          <>
            <ProgressBar value={territory.visit_count} max={territory.unit_count} />
            <p className="muted mt-1 text-xs">
              {territory.visit_count} von {territory.unit_count} Wohneinheiten bearbeitet
            </p>
          </>
        )}
        {territory.note && (
          <p className="mt-3 rounded-xl bg-brand-500/8 px-3 py-2 text-sm">
            <span className="font-semibold">Hinweis: </span>
            {territory.note}
          </p>
        )}
      </div>

      <TerritoryAreaCard
        territoryId={territory.id}
        name={territory.name}
        area={area}
        pins={pins}
        isLeader={isLeader}
        tileUrl={mapTileUrl()}
        otherAreas={otherAreas}
      />

      <TerritoryControls
        territory={{
          id: territory.id,
          status: territory.status,
          assigned_user_id: territory.assigned_user_id,
          assignee_name: territory.assignee_name,
          due_date: territory.due_date,
        }}
        members={members}
        isLeader={isLeader}
      />

      <StreetList
        territoryId={territory.id}
        streets={streets}
        isLeader={isLeader}
      />

      {visits.length > 0 && (
        <div className="card mt-4 p-4">
          <p className="mb-3 text-sm font-semibold">Letzte Kontakte</p>
          <ul className="space-y-2">
            {visits.map((v) => (
              <li key={v.id} className="flex items-start gap-2 text-sm">
                <span className="w-6 shrink-0 text-center">
                  {v.outcome === "SALE"
                    ? "✅"
                    : v.outcome === "APPOINTMENT"
                      ? "📅"
                      : v.outcome === "NOT_HOME"
                        ? "🚪"
                        : (v.reason_emoji || "🙋")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {v.street_name ?? "–"} {v.house_number}
                  </span>
                  {v.reason_label && <span className="muted"> · {v.reason_label}</span>}
                  {v.reason_note && <span className="muted"> · „{v.reason_note}“</span>}
                  <span className="muted block text-xs">
                    {v.user_name} · {formatDateTime(v.created_at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div>
      <p className="muted text-[11px] font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold tabular-nums">
        {value}
        {hint && <span className="muted ml-1 text-xs font-semibold">{hint}</span>}
      </p>
    </div>
  );
}

/** Fertig, sobald die Strasse abgehakt oder rechnerisch durchgearbeitet ist. */
function streetState(street: StreetWithStats): "open" | "active" | "done" {
  if (street.status === "DONE") return "done";
  if (street.units > 0 && street.visit_count >= street.units) return "done";
  return street.visit_count > 0 ? "active" : "open";
}

function formatDateTime(value: string): string {
  return new Date(`${value.replace(" ", "T")}Z`).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
