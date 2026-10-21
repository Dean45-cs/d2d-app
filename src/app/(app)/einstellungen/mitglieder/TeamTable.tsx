"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PermissionSet } from "@/lib/permission-definitions";
import { IconChevronRight, IconUserPlus, IconUsers } from "@/components/icons";
import { Avatar, Cell, EmptyState, ListLabel, PageHeader, Pill, Segmented, plural } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { CreateMemberSheet } from "./CreateMemberSheet";
import { MemberSheet, PasswordSheet } from "./MemberSheet";
import { syncPush } from "@/lib/push-client";
import { TeamStructure } from "./TeamStructure";
import { ROLE_LABEL, type MemberRow, type PatchMember } from "./types";

type SheetState = { kind: "member" | "password"; id: number } | { kind: "create" } | null;

/**
 * Mitglieder als gruppierte Liste (Handy) bzw. Tabelle (Rechner), dazu die
 * Struktur. Tippen auf eine Person oeffnet ihr Blatt - dort steckt alles,
 * was die Verwaltung an ihr aendern darf.
 */
export function TeamTable({
  rows,
  currentUserId,
  rights,
  editableIds,
}: {
  rows: MemberRow[];
  currentUserId: number;
  rights: PermissionSet;
  editableIds: number[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [view, setView] = useState<"list" | "structure">("list");
  const [sheet, setSheet] = useState<SheetState>(null);
  const reports = rights["reports.team"];

  const patch: PatchMember = async (id, body, done, undo) => {
    try {
      const response = await fetch(`/api/team/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast(data.error ?? "Änderung nicht möglich");
        return false;
      }
      toast(
        done,
        undo ? { action: { label: "Rückgängig", onClick: () => void patch(id, undo, "Rückgängig gemacht") } } : undefined,
      );
      router.refresh();
      return true;
    } catch {
      toast("Keine Verbindung – bitte gleich noch einmal versuchen");
      return false;
    }
  };

  async function toggleActive(member: MemberRow) {
    if (member.active) {
      const ok = await confirm({
        title: `${member.name} deaktivieren?`,
        text: "Die Anmeldung wird gesperrt. Türen und Zahlen bleiben erhalten.",
        confirmLabel: "Deaktivieren",
        danger: true,
      });
      if (!ok) return;
    }
    await patch(
      member.id,
      { active: !member.active },
      member.active ? `${member.name} deaktiviert` : `${member.name} ist wieder aktiv`,
    );
  }

  const open = (id: number) => setSheet({ kind: "member", id });
  const active = rows.filter((r) => r.active);
  const inactive = rows.filter((r) => !r.active);
  const leaders = active.filter((r) => r.role === "LEADER").length;
  const current = sheet && sheet.kind !== "create" ? rows.find((r) => r.id === sheet.id) : undefined;

  return (
    <>
      <PageHeader
        back={{ href: "/profil", label: "Profil", mobileOnly: true }}
        title="Mitglieder"
        subtitle={[
          `${active.length} aktiv`,
          leaders > 0 && plural(leaders, "Teamleitung", "Teamleitungen"),
          inactive.length > 0 && `${inactive.length} deaktiviert`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          rights["team.manage"] ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setSheet({ kind: "create" })}>
              <IconUserPlus className="h-4 w-4" />
              Anlegen
            </button>
          ) : undefined
        }
      >
        {rows.length > 0 && (
          <Segmented
            ariaLabel="Ansicht"
            className="max-w-xs"
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "Liste" },
              { value: "structure", label: "Struktur" },
            ]}
          />
        )}
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState
          boxed
          icon={<IconUsers className="h-6 w-6" />}
          title="Noch niemand im Team"
          action={
            rights["team.manage"] ? (
              <button type="button" className="btn btn-primary" onClick={() => setSheet({ kind: "create" })}>
                Mitglied anlegen
              </button>
            ) : undefined
          }
        />
      ) : view === "structure" ? (
        <div className="max-w-2xl">
          <TeamStructure members={rows} currentUserId={currentUserId} onOpen={open} />
        </div>
      ) : (
        <>
          {/* Handy und iPad: gruppierte Liste. */}
          <div className="xl:hidden">
            <MemberList label="Aktiv" rows={active} reports={reports} currentUserId={currentUserId} onOpen={open} />
            {inactive.length > 0 && (
              <MemberList label="Deaktiviert" rows={inactive} reports={false} currentUserId={currentUserId} onOpen={open} />
            )}
          </div>

          {/* Rechner: Tabelle zum Vergleichen; zu schmal, rollt sie seitlich. */}
          <div className="surface hidden overflow-x-auto xl:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Rolle</th>
                  <th>Gebiete</th>
                  {reports && (
                    <>
                      <th className="num">Türen</th>
                      <th className="num">Gespräche</th>
                      <th className="num">Abschlüsse</th>
                    </>
                  )}
                  <th className="w-px">
                    <span className="sr-only">Öffnen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="cursor-pointer" onClick={() => open(m.id)}>
                    <td>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={m.name} src={m.avatar} size={32} className={m.active ? "" : "opacity-50"} />
                        <span className="min-w-0 max-w-72">
                          <span className={`block truncate font-semibold ${m.active ? "" : "text-muted"}`}>
                            {m.name}
                            {m.id === currentUserId && <span className="font-normal text-muted"> · Du</span>}
                          </span>
                          <span className="block truncate text-footnote text-muted">{m.email}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="flex flex-wrap items-center gap-2">
                        {ROLE_LABEL[m.role]}
                        {!m.active && <Pill>Deaktiviert</Pill>}
                      </span>
                    </td>
                    <td>
                      {m.territories.length > 0 ? (
                        <span className="block max-w-56 truncate" title={m.territories.map((t) => t.name).join(", ")}>
                          {m.territories.map((t) => t.name).join(", ")}
                        </span>
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                    {reports && (
                      <>
                        <td className="num">{m.active ? m.doors : "–"}</td>
                        <td className="num">{m.active ? m.met : "–"}</td>
                        <td className={`num ${m.sales > 0 ? "font-semibold text-accent-ink" : ""}`}>
                          {m.active ? m.sales : "–"}
                        </td>
                      </>
                    )}
                    <td className="w-px">
                      <button
                        type="button"
                        className="icon-btn icon-btn-sm"
                        aria-label={`${m.name} öffnen`}
                        onClick={(event) => {
                          event.stopPropagation();
                          open(m.id);
                        }}
                      >
                        <IconChevronRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sheet?.kind === "create" && (
        <CreateMemberSheet
          canSetRole={rights["team.roles"]}
          onClose={() => setSheet(null)}
          onCreated={(name) => {
            setSheet(null);
            toast(`${name} angelegt`);
            router.refresh();
          }}
        />
      )}

      {sheet?.kind === "member" && current && (
        <MemberSheet
          member={current}
          members={rows}
          rights={rights}
          editable={editableIds.includes(current.id)}
          isSelf={current.id === currentUserId}
          onPatch={patch}
          onPassword={() => setSheet({ kind: "password", id: current.id })}
          onToggleActive={() => void toggleActive(current)}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === "password" && current && (
        <PasswordSheet
          member={current}
          onClose={() => setSheet(null)}
          onSave={async (password) => {
            const ok = await patch(current.id, { password }, `Neues Passwort für ${current.name} gesetzt`);
            // Eigenes Passwort: der Server meldet alle Geraete von Push ab - dieses gleich wieder an.
            if (ok && current.id === currentUserId) void syncPush().catch(() => undefined);
            return ok;
          }}
        />
      )}

      {dialog}
    </>
  );
}

/** Eine Gruppe der Handy-Liste: Bild, Name, Rolle, Gebiete, Zahlen. */
function MemberList({
  label,
  rows,
  reports,
  currentUserId,
  onOpen,
}: {
  label: string;
  rows: MemberRow[];
  reports: boolean;
  currentUserId: number;
  onOpen: (id: number) => void;
}) {
  return (
    <>
      <ListLabel>{label}</ListLabel>
      <ul className="list list-icons">
        {rows.map((m) => (
          <li key={m.id}>
            <Cell
              onClick={() => onOpen(m.id)}
              chevron
              icon={<Avatar name={m.name} src={m.avatar} size={32} />}
              title={m.name}
              subtitle={[
                m.id === currentUserId && "Du",
                ROLE_LABEL[m.role],
                m.territories.length > 0 && plural(m.territories.length, "Gebiet", "Gebiete"),
                reports && plural(m.doors, "Tür", "Türen"),
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={
                reports ? (
                  <span className={`kpi shrink-0 text-title-3 ${m.sales > 0 ? "text-accent-ink" : "text-muted"}`}>
                    <span className="sr-only">Abschlüsse: </span>
                    {m.sales}
                  </span>
                ) : undefined
              }
            />
          </li>
        ))}
      </ul>
    </>
  );
}
