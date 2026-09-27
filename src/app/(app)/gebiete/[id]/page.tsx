import { notFound } from "next/navigation";
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
  const provider = providerLookup(user.team_id).find({
    postal_code: territory.postal_code,
    city: territory.city,
    area,
  });
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
        editHref={isLeader ? "/einstellungen#grundversorger" : undefined}
      />

      <TerritoryAreaCard
        territoryId={territory.id}
        name={territory.name}
        area={area}
        pins={pins}
        isLeader={isLeader}
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

/** Fertig, sobald die Strasse abgehakt oder rechnerisch durchgearbeitet ist. */
function streetState(street: StreetWithStats): "open" | "active" | "done" {
  if (street.status === "DONE") return "done";
  if (street.units > 0 && street.visit_count >= street.units) return "done";
  return street.visit_count > 0 ? "active" : "open";
}
