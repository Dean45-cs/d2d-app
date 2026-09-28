import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { doorStatus } from "@/lib/doors";
import {
  getTerritory,
  listMembers,
  listStreets,
  listHouseNumbers,
  listTerritories,
  listVisits,
  type HouseNumberWithStats,
  type StreetWithStats,
} from "@/lib/queries";
import { readArea, readShape } from "@/lib/geo/area";
import { providerLookup } from "@/lib/energy/provider";
import { ProviderCard } from "@/components/ProviderRating";
import {
  Note,
  OutcomeIcon,
  PageHeader,
  ProgressBar,
  SectionHeader,
  StatusBadge,
  percent,
} from "@/components/ui";
import { IconInfo } from "@/components/icons";
import { sqlDateTime } from "@/lib/format";
import { ShowMore } from "@/components/ShowMore";
import { TerritoryControls } from "./TerritoryControls";
import { TerritoryAreaCard } from "./TerritoryAreaCard";
import type { DoorState, HourBucket, WorkDoor, WorkStreet } from "./TerritoryWorkspace";
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

  const area = readShape(territory.area_json);
  const provider = providerLookup(user.team_id).find({
    postal_code: territory.postal_code,
    city: territory.city,
    area: readArea(territory.area_json),
  });
  // Beim Nachziehen der Flaeche sollen die Nachbargebiete sichtbar sein.
  const otherAreas = isLeader
    ? listTerritories(user.team_id).flatMap((t) => {
        const other = t.id === territory.id ? null : readShape(t.area_json);
        return other ? [{ id: t.id, name: t.name, area: other }] : [];
      })
    : [];

  // Jede Hausnummer mit Lage wird eine Tuer auf der Arbeitskarte.
  const streetName = new Map(streets.map((street) => [street.id, street.name]));
  const doors: WorkDoor[] = houseNumbers.flatMap((house) =>
    house.lat !== null && house.lng !== null
      ? [
          {
            id: house.id,
            streetId: house.street_id,
            street: streetName.get(house.street_id) ?? "",
            number: house.number,
            lat: house.lat,
            lng: house.lng,
            state: houseState(house),
            units: house.units,
            attempts: house.not_home_count,
            bells: house.bell_count,
            bellsDone: house.bell_done_count,
            lastAt: house.last_visit_at,
            lastBy: house.last_visit_user,
          },
        ]
      : [],
  );

  // Strassen ohne Hausnummern mit Lage erscheinen als ein Punkt je Strasse.
  const withDoors = new Set(doors.map((door) => door.streetId));
  const workStreets: WorkStreet[] = streets.flatMap((street) =>
    street.lat !== null && street.lng !== null && !withDoors.has(street.id)
      ? [
          {
            id: street.id,
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

  const hours = hourBuckets(territory.id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: "/gebiete", label: isLeader ? "Gebiete" : "Meine Gebiete" }}
        title={territory.name}
        subtitle={
          [territory.postal_code, territory.city].filter(Boolean).join(" ") ||
          "Ohne Ortsangabe"
        }
        action={<StatusBadge status={territory.status} />}
      />

      <div className="card mb-4 p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
            <div className="mb-2 flex items-baseline justify-between gap-2 text-[12.5px]">
              <span className="muted font-medium">Fortschritt</span>
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

      <ProviderCard
        info={provider}
        className="mb-4"
        editHref={isLeader ? `/karte?gebiet=${territory.id}` : undefined}
      />

      <TerritoryAreaCard
        territoryId={territory.id}
        area={area}
        doors={doors}
        streets={workStreets}
        hours={hours}
        isLeader={isLeader}
        otherAreas={otherAreas}
      />

      <TerritoryControls
        territory={{
          id: territory.id,
          name: territory.name,
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
        <section className="card mt-4 p-5">
          <SectionHeader title="Letzte Kontakte" className="mb-1" />
          <ShowMore initial={8}>
            {visits.map((v) => (
              <li
                key={v.id}
                className="flex items-center gap-3 border-t py-2.5 first:border-t-0"
                style={{ borderColor: "var(--line)" }}
              >
                <OutcomeIcon outcome={v.outcome} />
                <span className="min-w-0 flex-1 text-[13.5px]">
                  <span className="block truncate">
                    <span className="font-medium">
                      {v.street_name ?? "–"} {v.house_number}
                    </span>
                    {v.reason_label && <span className="muted"> · {v.reason_label}</span>}
                    {v.reason_note && <span className="muted"> · „{v.reason_note}“</span>}
                  </span>
                  <span className="muted block truncate text-[12px]">
                    {v.user_name} · {sqlDateTime(v.created_at)}
                  </span>
                </span>
              </li>
            ))}
          </ShowMore>
        </section>
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
      <p className="muted text-[12.5px] font-medium">{label}</p>
      <p
        className="mt-1 text-[24px] font-bold leading-none tabular-nums"
        style={{
          color: tone === "success" ? "var(--ok-ink)" : "var(--ink)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
        {hint && <span className="muted ml-1 text-[12px] font-semibold">{hint}</span>}
      </p>
    </div>
  );
}

/** Stand einer Hausnummer fuer die Karte - Abschluss und Termin zuerst. */
function houseState(house: HouseNumberWithStats): DoorState {
  if (house.blocked_at) return "blocked";
  if (house.sale_count > 0) return "sale";
  if (house.last_outcome === "APPOINTMENT") return "appointment";
  if (house.bell_count > 0) {
    // Mehrfamilienhaus: fertig, wenn jede Klingel durch ist.
    if (house.bell_done_count >= house.bell_count) return "done";
    return house.visit_count > 0 ? "retry" : "open";
  }
  const status = doorStatus({
    blocked_at: house.blocked_at,
    not_home_count: house.not_home_count,
    met_count: house.met_count,
  });
  return status === "OPEN" ? "open" : status === "RETRY" ? "retry" : "done";
}

/**
 * Antreffquote nach Tageszeit (deutsche Uhrzeit). Gespeichert wird in UTC,
 * die Server-Uhr kann woanders stehen - deshalb die feste Zeitzone.
 */
function hourBuckets(territoryId: number): HourBucket[] {
  const rows = getDb()
    .prepare("SELECT created_at, outcome FROM visits WHERE territory_id = ?")
    .all(territoryId) as Array<{ created_at: string; outcome: string }>;
  const buckets: Array<HourBucket & { from: number; to: number }> = [
    { label: "9–12", from: 9, to: 12, total: 0, met: 0 },
    { label: "12–15", from: 12, to: 15, total: 0, met: 0 },
    { label: "15–18", from: 15, to: 18, total: 0, met: 0 },
    { label: "18–21", from: 18, to: 21, total: 0, met: 0 },
  ];
  const hourOf = new Intl.DateTimeFormat("de-DE", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: "Europe/Berlin",
  });
  for (const row of rows) {
    const date = new Date(`${row.created_at.replace(" ", "T")}Z`);
    if (Number.isNaN(date.getTime())) continue;
    // formatToParts statt format: auf Deutsch hiesse es sonst "10 Uhr".
    const hour = Number(hourOf.formatToParts(date).find((part) => part.type === "hour")?.value);
    const bucket = buckets.find((b) => hour >= b.from && hour < b.to);
    if (!bucket) continue;
    bucket.total++;
    if (row.outcome !== "NOT_HOME") bucket.met++;
  }
  return buckets.map(({ label, total, met }) => ({ label, total, met }));
}

/** Fertig, sobald die Strasse abgehakt oder rechnerisch durchgearbeitet ist. */
function streetState(street: StreetWithStats): "open" | "active" | "done" {
  if (street.status === "DONE") return "done";
  if (street.units > 0 && street.visit_count >= street.units) return "done";
  return street.visit_count > 0 ? "active" : "open";
}
