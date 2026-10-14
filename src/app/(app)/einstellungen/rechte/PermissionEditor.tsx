"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Avatar, Cell, EmptyState, InlineError, ListLabel, Notice, Segmented, plural } from "@/components/ui";
import { IconBan, IconUsers } from "@/components/icons";
import { PERMISSIONS, type Permission, type PermissionOverrides, type PermissionSet } from "@/lib/permission-definitions";
import type { Role } from "@/lib/types";

export interface EditableMember {
  id: number;
  name: string;
  avatar: string;
  role: Role;
  active: number;
  effective: PermissionSet;
  overrides: PermissionOverrides;
  /** Ergebnis ohne eigene Abweichung - das bedeutet "Standard". */
  standard: PermissionSet;
}

type Mode = "default" | "on" | "off";
type Changes = Partial<Record<Permission, boolean | null>>;

const MODES: Array<{ value: Mode; label: string }> = [
  { value: "default", label: "Standard" },
  { value: "on", label: "An" },
  { value: "off", label: "Aus" },
];

const GROUPS = Array.from(new Set(PERMISSIONS.map((item) => item.group)));

function toMode(value: boolean | null | undefined): Mode {
  return value === true ? "on" : value === false ? "off" : "default";
}

function fromMode(mode: Mode): boolean | null {
  return mode === "on" ? true : mode === "off" ? false : null;
}

function roleLine(member: EditableMember): string {
  const count = Object.keys(member.overrides).length;
  return [
    member.role === "LEADER" ? "Teamleitung" : "Vertrieb",
    !member.active && "Deaktiviert",
    count > 0 && plural(count, "Abweichung", "Abweichungen"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Personenwahl und Rechte. Auf iPad und Rechner nebeneinander, auf dem
 * Handy erst die Liste, nach dem Antippen die Rechte der Person.
 */
export function PermissionEditor({
  members,
  selectedId,
  grantable,
}: {
  members: EditableMember[];
  selectedId: number | null;
  grantable: PermissionSet;
}) {
  if (members.length === 0) {
    return <EmptyState boxed icon={<IconUsers className="h-6 w-6" />} title="Noch niemand in deiner Struktur" />;
  }
  // Ohne Auswahl zeigt der Rechner die erste Person; das Handy die Liste.
  const shown = members.find((member) => member.id === selectedId) ?? members[0];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
      <section className={selectedId ? "hidden lg:block" : ""} aria-label="Personen">
        <ul className="list list-icons">
          {members.map((member) => {
            const current = member.id === shown.id;
            return (
              <li key={member.id}>
                <Cell
                  href={`/einstellungen/rechte?person=${member.id}`}
                  icon={<Avatar name={member.name} src={member.avatar} size={32} />}
                  title={member.name}
                  subtitle={roleLine(member)}
                  current={current}
                  className={current ? "lg:bg-accent-tint" : ""}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section className={selectedId ? "" : "hidden lg:block"} aria-label={`Rechte von ${shown.name}`}>
        <MemberRights key={shown.id} member={shown} grantable={grantable} />
      </section>
    </div>
  );
}

function MemberRights({ member, grantable }: { member: EditableMember; grantable: PermissionSet }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [changes, setChanges] = useState<Changes>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = Object.keys(changes).length;

  const saved = (key: Permission) => member.overrides[key] ?? null;

  function change(key: Permission, mode: Mode) {
    if (busy) return;
    setError(null);
    setChanges((current) => {
      const next = { ...current };
      // Zurueck auf den gespeicherten Stand ist keine Aenderung mehr.
      if (fromMode(mode) === saved(key)) delete next[key];
      else next[key] = fromMode(mode);
      return next;
    });
  }

  async function send(permissions: Changes): Promise<string | null> {
    try {
      const response = await fetch(`/api/team/${member.id}/permissions`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      if (response.ok) return null;
      const data = await response.json().catch(() => ({}));
      return data.error || "Rechte nicht gespeichert.";
    } catch {
      return "Keine Verbindung.";
    }
  }

  async function save() {
    const previous = Object.fromEntries(
      (Object.keys(changes) as Permission[]).map((key) => [key, saved(key)]),
    ) as Changes;
    setBusy(true);
    setError(null);
    const failure = await send(changes);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    // Auswahl erst mit den neuen Daten leeren - sonst springt sie kurz zurueck.
    startTransition(() => {
      setChanges({});
      router.refresh();
    });
    toast("Rechte gespeichert", {
      action: {
        label: "Rückgängig",
        onClick: () => {
          void send(previous).then((undoFailure) => {
            toast(undoFailure ?? "Rückgängig gemacht");
            router.refresh();
          });
        },
      },
    });
  }

  return (
    <>
      <ul className="list list-icons lg:hidden">
        <li>
          <Cell
            href="/einstellungen/rechte"
            icon={<Avatar name={member.name} src={member.avatar} size={32} />}
            title={member.name}
            subtitle={roleLine(member)}
            detail="Wechseln"
          />
        </li>
      </ul>
      <h2 className="hidden px-1 text-title-2 lg:block">{member.name}</h2>

      {!member.active && (
        <div className="mt-4">
          <Notice icon={<IconBan className="h-5 w-5" />}>Deaktiviert – keine Rechte aktiv</Notice>
        </div>
      )}

      {GROUPS.map((group) => (
        <div key={group} className="mt-6">
          <ListLabel>{group}</ListLabel>
          <ul className="list">
            {PERMISSIONS.filter((item) => item.group === group).map(({ key, label }) => {
              const value = key in changes ? changes[key] : saved(key);
              const rolesOnly = key === "team.roles" && member.role !== "LEADER";
              const editable = grantable[key] && !rolesOnly;
              if (!editable) {
                return (
                  <li key={key}>
                    <Cell
                      title={label}
                      subtitle={rolesOnly ? "Nur für Teamleitungen" : "Nicht vergebbar"}
                      detail={member.effective[key] ? "Erlaubt" : "Nicht erlaubt"}
                    />
                  </li>
                );
              }
              return (
                <li
                  key={key}
                  className="cell flex-col items-stretch gap-2 py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-body">{label}</span>
                    <span className="block text-footnote text-muted">
                      Standard: {member.standard[key] ? "erlaubt" : "nicht erlaubt"}
                    </span>
                  </span>
                  <Segmented
                    ariaLabel={label}
                    options={MODES}
                    value={toMode(value)}
                    onChange={(mode) => change(key, mode)}
                    className="shrink-0 sm:w-80"
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {count > 0 && (
        <div className="glass sticky bottom-(--tabbar-space) z-30 mt-6 rounded-2xl p-2 md:bottom-6" role="region" aria-label="Änderungen">
          {error && (
            <div className="px-1 pb-2 pt-1">
              <InlineError>{error}</InlineError>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate pl-2 text-subhead font-semibold">
              {plural(count, "Änderung", "Änderungen")}
            </span>
            <button
              type="button"
              className="btn btn-plain btn-sm"
              disabled={busy}
              onClick={() => {
                setChanges({});
                setError(null);
              }}
            >
              Verwerfen
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>
              {busy ? "Speichern …" : "Speichern"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
