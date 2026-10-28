import type { Metadata } from "next";
import { permissionsFor, structureIds } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { listMembers, listAccessibleTerritories, topWorkers, type TerritoryWithStats } from "@/lib/queries";
import { combinedProgress, listGroups, partTitle, type TerritoryGroup } from "@/lib/territory-groups";
import { readShape } from "@/lib/geo/area";
import {
  Avatar,
  Cell,
  EmptyState,
  PageHeader,
  ProgressRing,
  SegmentedLinks,
  StatusBadge,
  plural,
} from "@/components/ui";
import { IconMap } from "@/components/icons";
import { NewTerritoryButton } from "../NewTerritory";
import { TerritoryOverviewMap, type OverviewTerritory } from "../TerritoryOverviewMap";
import { MAP_VIEWS } from "../views";
import { progressShare, territoryProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gebiete" };

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

  // Ohne Zuteilung zeigt die Karte, wer dort am meisten geklingelt hat.
  const workers = topWorkers(
    user.team_id,
    territories.filter((t) => !t.assigned_user_id).map((t) => t.id),
  );

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
            assigneeAvatar: t.assignee_avatar ?? "",
            worker: t.assigned_user_id ? null : (workers.get(t.id) ?? null),
            streets: t.street_count,
            progress: territoryProgress(t).label,
          },
        ]
      : [];
  });

  // Teilgebiete eines aufgeteilten Gebiets stehen beisammen unter dem Namen des Ganzen.
  const groups = listGroups(user.team_id);
  const byGroup = new Map<number, TerritoryWithStats[]>();
  for (const t of territories) {
    if (t.group_id && groups.has(t.group_id)) byGroup.set(t.group_id, [...(byGroup.get(t.group_id) ?? []), t]);
  }
  const rows: Array<
    | { kind: "territory"; territory: TerritoryWithStats; group?: TerritoryGroup }
    | { kind: "group"; group: TerritoryGroup; parts: TerritoryWithStats[] }
  > = [];
  const placed = new Set<number>();
  for (const t of territories) {
    const parts = t.group_id ? byGroup.get(t.group_id) : undefined;
    if (!parts || parts.length < 2) {
      rows.push({ kind: "territory", territory: t });
      continue;
    }
    if (placed.has(t.group_id!)) continue;
    placed.add(t.group_id!);
    const ordered = [...parts].sort((a, b) => a.id - b.id);
    const group = groups.get(t.group_id!)!;
    rows.push({ kind: "group", group, parts: ordered });
    for (const part of ordered) rows.push({ kind: "territory", territory: part, group });
  }

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
            {rows.map((row) => {
              if (row.kind === "group") {
                const progress = combinedProgress(row.parts);
                const share = progressShare(progress);
                const people = Array.from(
                  new Map(
                    row.parts
                      .filter((part) => part.assignee_name)
                      .map((part) => [part.assigned_user_id, { name: part.assignee_name!, avatar: part.assignee_avatar ?? "" }]),
                  ).values(),
                );
                return (
                  <li key={`g${row.group.id}`}>
                    <Cell
                      className="min-h-16"
                      icon={
                        <ProgressRing value={progress.done} max={Math.max(progress.total, 1)} size={36} stroke={4}>
                          {share !== null ? share : ""}
                        </ProgressRing>
                      }
                      title={row.group.name}
                      wrap
                      subtitle={[`${row.parts.length} Teilgebiete`, progress.label].join(" · ")}
                      trailing={
                        people.length > 0 ? (
                          <span className="flex shrink-0 -space-x-2" aria-label={people.map((p) => p.name).join(", ")}>
                            {people.slice(0, 4).map((person) => (
                              <Avatar key={person.name} name={person.name} src={person.avatar} size={26} className="ring-2 ring-surface" />
                            ))}
                          </span>
                        ) : undefined
                      }
                    />
                  </li>
                );
              }
              const t = row.territory;
              const progress = territoryProgress(t);
              const share = progressShare(progress);
              const worker = t.assigned_user_id ? null : workers.get(t.id);
              return (
                <li key={t.id}>
                  <Cell
                    href={`/gebiete/${t.id}`}
                    className={`min-h-16 ${row.group ? "pl-10" : ""}`}
                    icon={
                      <ProgressRing value={progress.done} max={Math.max(progress.total, 1)} size={row.group ? 32 : 36} stroke={4}>
                        {share !== null ? share : ""}
                      </ProgressRing>
                    }
                    title={row.group ? partTitle(t.name, row.group.name) : t.name}
                    wrap
                    subtitle={[
                      isLeader ? (t.assignee_name ?? (worker ? `bearbeitet von ${worker.name}` : "Nicht zugeteilt")) : t.city || null,
                      progress.label,
                      t.sale_count > 0 ? plural(t.sale_count, "Abschluss", "Abschlüsse") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    trailing={
                      <span className="flex shrink-0 items-center gap-2">
                        {/* Wer das Gebiet bearbeitet - auch ohne Zuteilung, wenn schon jemand dort war. */}
                        {isLeader && (t.assignee_name || worker) && (
                          <Avatar
                            name={t.assignee_name ?? worker!.name}
                            src={t.assignee_name ? t.assignee_avatar : worker!.avatar}
                            size={24}
                          />
                        )}
                        <StatusBadge status={t.status} />
                      </span>
                    }
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
