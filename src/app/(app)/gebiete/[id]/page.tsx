import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getTerritory,
  listMembers,
  listStreets,
  listHouseNumbers,
  listTerritories,
  listVisits,
  type StreetWithStats,
} from "@/lib/queries";
import { readArea } from "@/lib/geo/area";
import { mapTileUrl } from "@/lib/map";
import { Note, PageHeader, ProgressBar, StatusBadge, percent } from "@/components/ui";
import {
  IconCalendar,
  IconCheck,
  IconChevronLeft,
  IconDoor,
  IconInfo,
  IconPerson,
} from "@/components/icons";
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

  // Hausnummern je Strasse - aus der Kartenauswahl uebernommen.
  const houseNumbers = listHouseNumbers(streets.map((s) => s.id));
  const numbersByStreet: Record<number, typeof houseNumbers> = {};
  for (const house of houseNumbers) {
    (numbersByStreet[house.street_id] ??= []).push(house);
  }

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
      <Link
        href="/gebiete"
        className="muted mb-2 inline-flex items-center gap-1 text-[13px] font-semibold hover:text-brand-600"
      >
        <IconChevronLeft className="h-3.5 w-3.5" />
        Alle Gebiete
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Straßen" value={territory.street_count} />
          <Metric label="Türen erfasst" value={territory.visit_count} />
          <Metric label="Angetroffen" value={territory.met_count} />
          <Metric
            label="Abschlüsse"
            value={territory.sale_count}
            hint={territory.met_count > 0 ? percent(territory.sale_count, territory.met_count) : undefined}
            tone="success"
          />
        </div>
        {territory.unit_count > 0 && (
          <div className="mt-3.5">
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px]">
              <span className="muted font-semibold">Fortschritt</span>
              <span className="font-semibold tabular-nums">
                {territory.visit_count} von {territory.unit_count} Wohneinheiten
              </span>
            </div>
            <ProgressBar
              value={territory.visit_count}
              max={territory.unit_count}
              tone={territory.status === "DONE" ? "success" : "brand"}
            />
          </div>
        )}
        {territory.note && (
          <div className="mt-3">
            <Note icon={<IconInfo className="h-4 w-4" />} tone="brand">
              {territory.note}
            </Note>
          </div>
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
        numbers={numbersByStreet}
        isLeader={isLeader}
      />

      {visits.length > 0 && (
        <div className="card mt-4 overflow-hidden">
          <p className="px-4 pb-1.5 pt-3.5 text-[13px] font-semibold">Letzte Kontakte</p>
          <ul>
            {visits.map((v) => (
              <li
                key={v.id}
                className="flex items-start gap-2.5 border-t px-4 py-2.5"
                style={{ borderColor: "var(--line)" }}
              >
                <span
                  className="tile-icon mt-0.5 h-7 w-7 shrink-0"
                  style={{
                    background: `color-mix(in srgb, ${outcomeColor(v.outcome)} 14%, transparent)`,
                    color: outcomeColor(v.outcome),
                  }}
                  aria-hidden
                >
                  {v.outcome === "SALE" ? (
                    <IconCheck className="h-4 w-4" />
                  ) : v.outcome === "APPOINTMENT" ? (
                    <IconCalendar className="h-4 w-4" />
                  ) : v.outcome === "NOT_HOME" ? (
                    <IconDoor className="h-4 w-4" />
                  ) : v.reason_emoji ? (
                    <span className="text-[13px] leading-none">{v.reason_emoji}</span>
                  ) : (
                    <IconPerson className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1 text-[13px]">
                  <span className="font-medium">
                    {v.street_name ?? "–"} {v.house_number}
                  </span>
                  {v.reason_label && <span className="muted"> · {v.reason_label}</span>}
                  {v.reason_note && <span className="muted"> · „{v.reason_note}“</span>}
                  <span className="muted block text-[11px]">
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
  tone = "neutral",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "neutral" | "success";
}) {
  return (
    <div>
      <p className="muted text-[10px] font-bold uppercase tracking-[0.07em]">{label}</p>
      <p
        className="mt-0.5 text-[22px] font-bold leading-none tabular-nums"
        style={{
          color: tone === "success" ? "var(--energy-600)" : "var(--ink)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
        {hint && <span className="muted ml-1 text-[12px] font-semibold">{hint}</span>}
      </p>
    </div>
  );
}

/** Farbe eines Ergebnisses - dieselbe wie an der Tuer. */
function outcomeColor(outcome: string): string {
  if (outcome === "SALE") return "var(--energy-600)";
  if (outcome === "APPOINTMENT") return "var(--brand-600)";
  if (outcome === "NOT_HOME") return "var(--ink-muted)";
  return "var(--signal-600)";
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
