import Link from "next/link";
import { notFound } from "next/navigation";
import { handoverSummary } from "@/lib/territory-handover";
import { TerritoryHandover } from "@/components/TerritoryHandover";
import { canAccessTerritory, permissionsFor, structureIds } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { doorStatus } from "@/lib/doors";
import {
  getTerritory,
  listMembers,
  listStreets,
  listHouseNumbers,
  listAccessibleTerritories,
  listVisits,
  type HouseNumberWithStats,
  type StreetWithStats,
} from "@/lib/queries";
import { readArea, readShape } from "@/lib/geo/area";
import { providerLookup } from "@/lib/energy/provider";
import { ProviderSummary } from "@/components/ProviderRating";
import { HourBars } from "@/components/charts";
import { EmptyState, ListLabel, Notice, OutcomeGlyph, PageHeader, StatGrid, percent } from "@/components/ui";
import { IconDoor, IconInfo, IconMap } from "@/components/icons";
import { sqlDateTime } from "@/lib/format";
import { progressShare, territoryProgress } from "@/lib/progress";
import { ShowMore } from "@/components/ShowMore";
import { TerritoryActions, AreaSetupButton } from "./TerritoryActions";
import { TerritoryControls } from "./TerritoryControls";
import {
  TerritoryWorkspace,
  type DoorState,
  type HourBucket,
  type WorkDoor,
  type WorkStreet,
} from "./TerritoryWorkspace";
import { StreetList } from "./StreetList";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Offen",
  ACTIVE: "In Arbeit",
  PAUSED: "Pausiert",
  DONE: "Fertig",
};

/**
 * Ein Gebiet: oben die Arbeitskarte mit der naechsten offenen Tuer, daneben
 * (auf dem Handy darunter) wer dran ist, der Stand, die Strassen. Selten
 * Gebrauchtes steckt im Menue oben rechts.
 */
export default async function TerritoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const territory = getTerritory(Number(id), user.team_id);
  if (!territory) notFound();

  const rights = permissionsFor(user);
  const isLeader = rights["territories.edit"];
  if (!canAccessTerritory(user, territory)) notFound();
  const canStatus = isLeader || territory.assigned_user_id === user.id;

  const streets = listStreets(territory.id);
  const ids = new Set([user.id, ...structureIds(user)]);
  const members = rights["territories.assign"]
    ? listMembers(user.team_id).filter(
        (member) => rights["territories.view_all"] || ids.has(member.id) || member.id === territory.assigned_user_id,
      )
    : [];
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
    ? listAccessibleTerritories(user).flatMap((t) => {
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
  const handover = handoverSummary(territory);
  const hasMap = Boolean(area) || doors.length > 0 || workStreets.length > 0;
  // Losgehen: die erste Strasse, die noch nicht fertig ist.
  const startStreet = streets.find((s) => s.status !== "DONE") ?? null;
  const place = [territory.postal_code, territory.city].filter(Boolean).join(" ");
  const progress = territoryProgress(territory);
  const share = progressShare(progress);

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/gebiete", label: "Karte" }}
        title={territory.name}
        subtitle={[place || null, STATUS_LABEL[territory.status] ?? territory.status].filter(Boolean).join(" · ")}
        actions={
          <>
            <TerritoryActions
              territoryId={territory.id}
              name={territory.name}
              area={area}
              otherAreas={otherAreas}
              canEdit={isLeader}
              canDelete={rights["territories.delete"]}
            />
            {startStreet && territory.status !== "DONE" && (
              <Link href={`/tour?street=${startStreet.id}`} className="btn btn-primary btn-sm">
                <IconDoor className="h-4 w-4" />
                Klingeln
              </Link>
            )}
          </>
        }
      />

      <StatGrid
        items={[
          { label: "Fortschritt", value: share !== null ? `${share} %` : progress.label, hint: share !== null ? progress.label : undefined },
          { label: "Offen", value: handover.openDoors, hint: `${handover.retryDoors} nochmal` },
          {
            label: "Gespräche",
            value: territory.met_count,
            hint: `${percent(territory.met_count, territory.visit_count)} angetroffen`,
          },
          {
            label: "Abschlüsse",
            value: territory.sale_count,
            accent: territory.sale_count > 0,
            hint: `${percent(territory.sale_count, territory.met_count)} Quote`,
          },
        ]}
      />

      {territory.note && (
        <div className="mt-4">
          <Notice icon={<IconInfo className="h-4 w-4" />}>{territory.note}</Notice>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start">
        <div className="lg:sticky lg:top-16">
          {hasMap ? (
            <TerritoryWorkspace area={area} doors={doors} streets={workStreets} />
          ) : (
            <div className="surface">
              <EmptyState
                icon={<IconMap className="h-6 w-6" />}
                title="Noch keine Fläche"
                action={isLeader ? <AreaSetupButton territoryId={territory.id} otherAreas={otherAreas} /> : undefined}
              />
            </div>
          )}
        </div>

        <div className="space-y-8">
          <TerritoryControls
            openAppointments={handover.appointments.length}
            canTransferAppointments={rights["appointments.team"]}
            territory={{
              id: territory.id,
              status: territory.status,
              assigned_user_id: territory.assigned_user_id,
              assignee_name: territory.assignee_name,
              due_date: territory.due_date,
            }}
            members={members}
            canAssign={rights["territories.assign"]}
            canStatus={canStatus}
          />

          <TerritoryHandover summary={handover} />

          <StreetList
            territoryId={territory.id}
            streets={streets}
            numbers={numbersByStreet}
            isLeader={isLeader}
            canStatus={canStatus}
          />

          <section>
            <ListLabel>Grundversorger</ListLabel>
            <ProviderSummary
              info={provider}
              editHref={rights["energy.manage"] ? `/karte?gebiet=${territory.id}` : undefined}
            />
          </section>

          {hours.some((h) => h.total > 0) && (
            <section>
              <ListLabel>Antreffquote nach Uhrzeit</ListLabel>
              <div className="surface p-4">
                <HourBars hours={hours} />
              </div>
            </section>
          )}

          {visits.length > 0 && (
            <section>
              <ListLabel>Letzte Kontakte</ListLabel>
              <ShowMore initial={6} className="list list-icons">
                {visits.map((v) => (
                  <li key={v.id} className="cell">
                    <OutcomeGlyph outcome={v.outcome} emoji={v.reason_emoji} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">
                        {v.street_name ?? "–"} {v.house_number}
                      </span>
                      <span className="block truncate text-footnote text-muted">
                        {[v.reason_label, v.reason_note ? `„${v.reason_note}“` : null, v.user_name, sqlDateTime(v.created_at)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </li>
                ))}
              </ShowMore>
            </section>
          )}
        </div>
      </div>
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
