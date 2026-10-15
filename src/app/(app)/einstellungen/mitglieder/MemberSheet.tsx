"use client";

import { useRef, useState } from "react";
import type { PermissionSet } from "@/lib/permission-definitions";
import type { Role } from "@/lib/types";
import { avatarToDataUrl, fileToAvatar } from "@/lib/avatar";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Cell, InlineError, ListLabel, Segmented, StatGrid } from "@/components/ui";
import { IconKey, IconMap, IconPerson, IconShield } from "@/components/icons";
import { ROLE_LABEL, type MemberRow, type PatchMember } from "./types";

/**
 * Alles zu einer Person in einem Blatt: Bild, Zahlen, Rolle, Fuehrungskraft,
 * Gebiete, Konto. Jede Aenderung gilt sofort und meldet sich per Toast.
 */
export function MemberSheet({
  member: m,
  members,
  rights,
  editable,
  isSelf,
  onPatch,
  onPassword,
  onToggleActive,
  onClose,
}: {
  member: MemberRow;
  members: MemberRow[];
  rights: PermissionSet;
  editable: boolean;
  isSelf: boolean;
  onPatch: PatchMember;
  onPassword: () => void;
  onToggleActive: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Gewaehlter Wert, bis die frischen Daten da sind - "base" merkt sich den Stand davor.
  const [role, setRole] = useState<{ value: Role; base: Role } | null>(null);
  const [manager, setManager] = useState<{ value: number | null; base: number | null } | null>(null);

  const canManage = editable && rights["team.manage"];
  const canRole = editable && rights["team.roles"] && !isSelf;
  const canStructure = editable && rights["structure.manage"];
  // Sind die frischen Daten da, gilt wieder der Server (auch nach "Rückgängig").
  if (role && role.base !== m.role) setRole(null);
  if (manager && manager.base !== m.manager_id) setManager(null);
  const shownRole = role && role.base === m.role ? role.value : m.role;
  const shownManager = manager && manager.base === m.manager_id ? manager.value : m.manager_id;
  const managerName = members.find((p) => p.id === m.manager_id)?.name;
  const direct = members.filter((p) => p.manager_id === m.id).length;
  const first = m.name.split(/\s+/)[0] || m.name;

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await onPatch(m.id, { avatar: await fileToAvatar(file) }, "Profilbild gespeichert");
    } catch (problem) {
      toast(problem instanceof Error ? problem.message : "Bild nicht lesbar");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAvatar() {
    // Angezeigt wird nur die Adresse des Bildes - fuers Rueckgaengig das Bild selbst merken.
    const previous = await avatarToDataUrl(m.avatar);
    await onPatch(m.id, { avatar: "" }, "Profilbild entfernt", previous ? { avatar: previous } : undefined);
  }

  async function changeRole(next: Role) {
    if (next === shownRole) return;
    setRole({ value: next, base: m.role });
    const ok = await onPatch(
      m.id,
      { role: next },
      next === "LEADER" ? `${first} ist jetzt Teamleitung` : `${first} ist jetzt im Vertrieb`,
      { role: m.role },
    );
    if (!ok) setRole(null);
  }

  async function changeManager(value: string) {
    const next = value ? Number(value) : null;
    setManager({ value: next, base: m.manager_id });
    const ok = await onPatch(m.id, { manager_id: next }, "Struktur gespeichert", { manager_id: m.manager_id });
    if (!ok) setManager(null);
  }

  return (
    <Sheet
      title={m.name}
      subtitle={[m.email, m.phone].filter(Boolean).join(" · ")}
      onClose={onClose}
    >
      <div className="flex flex-col items-center gap-3 pb-2">
        <Avatar name={m.name} src={m.avatar} size={80} loading={busy} />
        {canManage && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              {m.avatar ? "Bild ändern" : "Bild wählen"}
            </button>
            {m.avatar && (
              <button
                type="button"
                className="btn btn-plain btn-sm"
                disabled={busy}
                onClick={() => void removeAvatar()}
              >
                Entfernen
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </div>
        )}
      </div>

      {rights["reports.team"] && m.active ? (
        <div className="mt-4">
          <StatGrid
            columns={3}
            items={[
              { label: "Türen", value: m.doors },
              { label: "Gespräche", value: m.met },
              { label: "Abschlüsse", value: m.sales, accent: m.sales > 0 },
            ]}
          />
        </div>
      ) : null}

      <ListLabel>Rolle</ListLabel>
      {canRole ? (
        <Segmented
          ariaLabel="Rolle"
          value={shownRole}
          onChange={(next) => void changeRole(next)}
          options={[
            { value: "MEMBER", label: ROLE_LABEL.MEMBER },
            { value: "LEADER", label: ROLE_LABEL.LEADER },
          ]}
        />
      ) : (
        <ul className="list">
          <li>
            <Cell title={ROLE_LABEL[m.role]} detail={m.active ? undefined : "Deaktiviert"} />
          </li>
        </ul>
      )}

      <ListLabel>Struktur</ListLabel>
      <ul className="list">
        <li>
          {canStructure ? (
            <label className="cell">
              <span className="shrink-0 text-body">Führungskraft</span>
              <select
                className="field field-bare min-w-0 flex-1 text-muted"
                value={shownManager ?? ""}
                onChange={(e) => void changeManager(e.target.value)}
              >
                <option value="" disabled={m.role !== "LEADER"}>
                  {m.role === "LEADER" ? "Strukturspitze" : "Bitte zuordnen"}
                </option>
                {members
                  .filter((p) => p.id !== m.id && (p.active || p.id === m.manager_id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.active ? "" : " (deaktiviert)"}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <Cell
              title="Führungskraft"
              detail={managerName ?? (m.role === "LEADER" ? "Strukturspitze" : "Nicht zugeordnet")}
            />
          )}
        </li>
        {direct > 0 && (
          <li>
            <Cell title="Direkt darunter" detail={direct} />
          </li>
        )}
      </ul>

      {m.territories.length > 0 && (
        <>
          <ListLabel>Gebiete</ListLabel>
          <ul className="list list-icons">
            {m.territories.map((t) => (
              <li key={t.id}>
                <Cell
                  href={t.open ? `/gebiete/${t.id}` : undefined}
                  icon={
                    <span className="glyph">
                      <IconMap className="h-4 w-4" />
                    </span>
                  }
                  title={t.name}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <ListLabel>Konto</ListLabel>
      <ul className="list list-icons">
        <li>
          <Cell
            href={`/profil/${m.id}`}
            icon={
              <span className="glyph">
                <IconPerson className="h-4 w-4" />
              </span>
            }
            title="Profil"
          />
        </li>
        {rights["permissions.manage"] && editable && !isSelf && (
          <li>
            <Cell
              href={`/einstellungen/rechte?person=${m.id}`}
              icon={
                <span className="glyph">
                  <IconShield className="h-4 w-4" />
                </span>
              }
              title="Rechte"
            />
          </li>
        )}
        {canManage && (
          <li>
            <Cell
              onClick={onPassword}
              chevron
              icon={
                <span className="glyph">
                  <IconKey className="h-4 w-4" />
                </span>
              }
              title="Passwort neu setzen"
            />
          </li>
        )}
      </ul>

      {canManage && !isSelf && (
        <ul className="list mt-6">
          <li>
            <Cell
              onClick={onToggleActive}
              tone={m.active ? "danger" : "accent"}
              title={m.active ? "Deaktivieren" : "Wieder aktivieren"}
            />
          </li>
        </ul>
      )}
    </Sheet>
  );
}

/** Neues Passwort setzen - die Leitung gibt es danach selbst weiter. */
export function PasswordSheet({
  member,
  onClose,
  onSave,
}: {
  member: MemberRow;
  onClose: () => void;
  onSave: (password: string) => Promise<boolean>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Mindestens 8 Zeichen.");
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onSave(password);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet
      title="Neues Passwort"
      subtitle={member.name}
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button type="submit" form="member-password" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? "Speichern …" : "Passwort setzen"}
          </button>
        </div>
      }
    >
      <form id="member-password" onSubmit={submit}>
        <div className="list">
          <label className="cell">
            <span className="w-24 shrink-0 text-body">Passwort</span>
            <input
              className="field field-bare min-w-0 flex-1"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              minLength={8}
              placeholder="Mind. 8 Zeichen"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
        </div>
      </form>
    </Sheet>
  );
}
