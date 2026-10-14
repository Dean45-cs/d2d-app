import { permissionsFor, structureIds } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { listMembers, listAccessibleTerritories } from "@/lib/queries";
import { readShape } from "@/lib/geo/area";
import {
  Cell,
  EmptyState,
  PageHeader,
  ProgressRing,
  SegmentedLinks,
  StatusBadge,
  plural,
} from "@/components/ui";
import { IconMap } from "@/components/icons";
import { NewTerritoryButton } from "./NewTerritory";
import { TerritoryOverviewMap, type OverviewTerritory } from "./TerritoryOverviewMap";
import { MAP_VIEWS } from "./views";
import { progressShare, territoryProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

export default async function TerritoriesPage() {
  const user = await requireUser();
  const rights = permissionsFor(user);
  const canCreate = rights["territories.create"];
  const isLeader = rights["territories.view_all"] || canCreate;

  const territories = listAccessibleTerritories(user);
  const ids = new Set([user.id, ...structureIds(user)]);
  const members = canCreate
    ? listMembers(user.team_id).filter((member) =>
        rights["territories.assign"] ? rights["territories.view_all"] || ids.has(member.id) : member.id === user.id,
      )
    : [];

  // Nur Gebiete mit gezeichneter Flaeche kommen auf die Karte.
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
            progress: territoryProgress(t).label,
          },
        ]
      : [];
  });

  const unassigned = territories.filter((t) => !t.assigned_user_id).length;
  const summary =
    territories.length === 0
      ? undefined
      : [plural(territories.length, "Gebiet", "Gebiete"), isLeader && unassigned > 0 && `${unassigned} ohne Zuteilung`]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="page">
      <PageHeader
        title="Karte"
        subtitle={summary}
        actions={
          canCreate ? (
            <NewTerritoryButton
              members={members}
              canAssign={rights["territories.assign"]}
              existingAreas={mapped.map((t) => ({ id: t.id, name: t.name, area: t.area }))}
            />
          ) : undefined
        }
      >
        <SegmentedLinks ariaLabel="Ansicht der Karte" current="gebiete" options={MAP_VIEWS} className="max-w-xs" />
      </PageHeader>

      {territories.length === 0 ? (
        <EmptyState
          boxed
          icon={<IconMap className="h-6 w-6" />}
          title={isLeader ? "Noch keine Gebiete" : "Noch kein Gebiet zugeteilt"}
          text={canCreate ? "Gebiet auf der Karte abstecken – die Straßen kommen von selbst." : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
          {mapped.length > 0 && (
            <div className="lg:sticky lg:top-6 lg:col-start-2">
              <TerritoryOverviewMap territories={mapped} className="h-[44vh] min-h-64 w-full lg:h-[calc(100dvh-220px)]" />
            </div>
          )}
          <ul className="list list-icons lg:col-start-1 lg:row-start-1">
            {territories.map((t) => {
              const progress = territoryProgress(t);
              const share = progressShare(progress);
              return (
                <li key={t.id}>
                  <Cell
                    href={`/gebiete/${t.id}`}
                    className="min-h-16"
                    icon={
                      <ProgressRing value={progress.done} max={Math.max(progress.total, 1)} size={36} stroke={4}>
                        {share !== null ? share : ""}
                      </ProgressRing>
                    }
                    title={t.name}
                    subtitle={[
                      isLeader ? (t.assignee_name ?? "Frei") : t.city || null,
                      progress.label,
                      t.sale_count > 0 ? plural(t.sale_count, "Abschluss", "Abschlüsse") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    trailing={<StatusBadge status={t.status} />}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
