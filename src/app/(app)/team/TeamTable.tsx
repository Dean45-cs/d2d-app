"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  IconCheck,
  IconImage,
  IconKey,
  IconShield,
  IconUserPlus,
  IconUsers,
  IconX,
} from "@/components/icons";
import { Avatar, EmptyState, Note, PageHeader, Pill, plural, type Tone } from "@/components/ui";
import { Menu, MenuItem, MenuSeparator } from "@/components/Menu";
import { Sheet } from "@/components/Sheet";
import { useConfirm } from "@/components/useConfirm";
import { fileToAvatar } from "@/lib/avatar";
import type { User } from "@/lib/types";

type Row = User & {
  doors: number;
  met: number;
  sales: number;
  territories: string[];
};

type Notice = { tone: Tone; text: string } | null;

export function TeamTable({
  rows,
  currentUserId,
}: {
  rows: Row[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const { confirm, dialog } = useConfirm();

  // Rueckmeldungen verschwinden von selbst - sie sollen nicht stehen bleiben.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function patch(id: number, body: Record<string, unknown>, done: string) {
    try {
      const response = await fetch(`/api/team/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json();
        setNotice({ tone: "danger", text: data.error ?? "Änderung nicht möglich." });
        return false;
      }
      setNotice({ tone: "success", text: done });
      router.refresh();
      return true;
    } catch {
      setNotice({ tone: "danger", text: "Keine Verbindung – bitte gleich noch einmal versuchen." });
      return false;
    }
  }

  async function toggleActive(member: Row) {
    if (member.active) {
      const ok = await confirm({
        title: `${member.name} deaktivieren?`,
        text: "Die Anmeldung ist danach gesperrt. Erfasste Türen und Zahlen bleiben erhalten, das Konto lässt sich jederzeit wieder aktivieren.",
        confirmLabel: "Deaktivieren",
        danger: true,
      });
      if (!ok) return;
    }
    await patch(
      member.id,
      { active: !member.active },
      member.active ? `${member.name} ist deaktiviert.` : `${member.name} ist wieder aktiv.`,
    );
  }

  const leaders = rows.filter((r) => r.role === "LEADER").length;
  const inactive = rows.filter((r) => !r.active).length;

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={[
          plural(rows.length - inactive, "aktives Mitglied", "aktive Mitglieder"),
          leaders > 0 && plural(leaders, "Teamleitung", "Teamleitungen"),
          inactive > 0 && `${inactive} deaktiviert`,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <IconUserPlus className="h-[18px] w-[18px]" />
            Mitarbeiter anlegen
          </button>
        }
      />

      {notice && (
        <div className="mb-4" role="status">
          <Note tone={notice.tone} icon={notice.tone === "success" ? <IconCheck className="h-4 w-4" /> : undefined}>
            {notice.text}
          </Note>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-7 w-7" />}
          title="Noch niemand im Team"
          action={
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              Ersten Mitarbeiter anlegen
            </button>
          }
        />
      ) : (
        // Ohne "overflow: hidden" der Liste - sonst schneidet sie das Menue ab.
        <ul className="list" style={{ overflow: "visible" }}>
          {rows.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              isSelf={m.id === currentUserId}
              onAvatar={(avatar) =>
                patch(m.id, { avatar }, avatar ? "Profilbild gespeichert." : "Profilbild entfernt.")
              }
              onAvatarError={(text) => setNotice({ tone: "danger", text })}
              onPassword={() => setResetFor(m)}
              onRole={() =>
                patch(
                  m.id,
                  { role: m.role === "LEADER" ? "MEMBER" : "LEADER" },
                  m.role === "LEADER"
                    ? `${m.name} ist jetzt im Vertrieb.`
                    : `${m.name} ist jetzt Teamleitung.`,
                )
              }
              onActive={() => void toggleActive(m)}
            />
          ))}
        </ul>
      )}

      {creating && (
        <CreateMemberSheet
          onClose={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false);
            setNotice({ tone: "success", text: `${name} ist angelegt und kann sich anmelden.` });
            router.refresh();
          }}
        />
      )}

      {resetFor && (
        <PasswordSheet
          member={resetFor}
          onClose={() => setResetFor(null)}
          onSave={(password) =>
            patch(resetFor.id, { password }, `Neues Passwort für ${resetFor.name} gesetzt.`)
          }
        />
      )}

      {dialog}
    </>
  );
}

/* ------------------------------------------------------------------------ */

function MemberRow({
  member: m,
  isSelf,
  onAvatar,
  onAvatarError,
  onPassword,
  onRole,
  onActive,
}: {
  member: Row;
  isSelf: boolean;
  onAvatar: (avatar: string) => Promise<boolean>;
  onAvatarError: (text: string) => void;
  onPassword: () => void;
  onRole: () => void;
  onActive: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await onAvatar(await fileToAvatar(file));
    } catch (problem) {
      onAvatarError(problem instanceof Error ? problem.message : "Bild nicht lesbar.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <li className={`flex items-center gap-3.5 px-4 py-3.5 ${m.active ? "" : "opacity-60"}`}>
      <Avatar name={m.name} src={m.avatar} size={44} loading={busy} />

      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[15px] font-semibold">{m.name}</span>
          {m.role === "LEADER" && <Pill tone="brand">Teamleitung</Pill>}
          {!m.active && <Pill tone="danger">Deaktiviert</Pill>}
          {isSelf && <span className="muted text-[12px]">Du</span>}
        </p>
        <p className="muted truncate text-[13px]">
          {[m.email, m.phone].filter(Boolean).join(" · ")}
        </p>
        {m.territories.length > 0 && (
          <p className="muted mt-0.5 truncate text-[12px]">
            {plural(m.territories.length, "Gebiet", "Gebiete")}: {m.territories.join(", ")}
          </p>
        )}
        {/* Auf dem Handy stehen die Zahlen unter dem Namen. */}
        <p className="muted mt-1 text-[12px] tabular-nums sm:hidden">
          {m.doors} Türen · {m.met} angetroffen ·{" "}
          <span className="font-semibold text-ok">{m.sales} Abschlüsse</span>
        </p>
      </div>

      <dl className="hidden shrink-0 gap-6 text-right sm:flex">
        <Figure label="Türen" value={m.doors} />
        <Figure label="Angetroffen" value={m.met} />
        <Figure label="Abschlüsse" value={m.sales} success />
      </dl>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <Menu label={`Aktionen für ${m.name}`}>
        <MenuItem icon={<IconImage className="h-[18px] w-[18px]" />} onSelect={() => fileRef.current?.click()}>
          {m.avatar ? "Profilbild ändern" : "Profilbild hinzufügen"}
        </MenuItem>
        {m.avatar && (
          <MenuItem icon={<IconX className="h-[18px] w-[18px]" />} onSelect={() => void onAvatar("")}>
            Profilbild entfernen
          </MenuItem>
        )}
        <MenuItem icon={<IconKey className="h-[18px] w-[18px]" />} onSelect={onPassword}>
          Passwort neu setzen
        </MenuItem>
        {!isSelf && (
          <>
            <MenuItem icon={<IconShield className="h-[18px] w-[18px]" />} onSelect={onRole}>
              {m.role === "LEADER" ? "Zu Vertrieb machen" : "Zur Teamleitung machen"}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<IconUsers className="h-[18px] w-[18px]" />}
              onSelect={onActive}
              tone={m.active ? "danger" : undefined}
            >
              {m.active ? "Deaktivieren" : "Wieder aktivieren"}
            </MenuItem>
          </>
        )}
      </Menu>
    </li>
  );
}

function Figure({ label, value, success }: { label: string; value: number; success?: boolean }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="muted text-[11.5px]">{label}</dt>
      <dd
        className="text-[16px] font-bold tabular-nums"
        style={{ color: success && value ? "var(--ok-ink)" : "var(--ink)" }}
      >
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function PasswordSheet({
  member,
  onClose,
  onSave,
}: {
  member: Row;
  onClose: () => void;
  onSave: (password: string) => Promise<boolean>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Das Passwort braucht mindestens 8 Zeichen.");
      return;
    }
    setBusy(true);
    const ok = await onSave(password);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet
      title="Passwort neu setzen"
      subtitle={`Für ${member.name}. Das neue Passwort gibst du anschließend selbst weiter.`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="pw-new">
            Neues Passwort
          </label>
          <input
            id="pw-new"
            className="input"
            type="text"
            autoComplete="off"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <p className="muted mt-1.5 text-[12px]">Mindestens 8 Zeichen.</p>
        </div>
        {error && <Note tone="danger">{error}</Note>}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Speichern …" : "Passwort setzen"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function CreateMemberSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "MEMBER",
    avatar: "",
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Mitarbeiter konnte nicht angelegt werden.");
        return;
      }
      onCreated(form.name);
    } catch {
      setError("Keine Verbindung – bitte gleich noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Mitarbeiter anlegen"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <Note tone="danger">{error}</Note>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" form="create-member" className="btn btn-primary" disabled={busy}>
              {busy ? "Anlegen …" : "Anlegen"}
            </button>
          </div>
        </div>
      }
    >
      <form id="create-member" onSubmit={submit} className="space-y-3 pb-1">
        <AvatarPicker
          name={form.name}
          value={form.avatar}
          onChange={(avatar) => setForm((prev) => ({ ...prev, avatar }))}
        />
        <div>
          <label className="label" htmlFor="m-name">Name</label>
          <input
            id="m-name"
            className="input"
            autoComplete="off"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="m-mail">E-Mail für die Anmeldung</label>
          <input
            id="m-mail"
            className="input"
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="m-phone">Telefon (optional)</label>
            <input
              id="m-phone"
              className="input"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="m-role">Rolle</label>
            <select
              id="m-role"
              className="select"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="MEMBER">Vertrieb</option>
              <option value="LEADER">Teamleitung</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="m-pw">Startpasswort</label>
          <input
            id="m-pw"
            className="input"
            type="text"
            autoComplete="off"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <p className="muted mt-1.5 text-[12px]">
            Mindestens 8 Zeichen. Du kannst es später jederzeit neu setzen.
          </p>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * Profilbild waehlen - Vorschau links, Knopf rechts.
 *
 * Das Bild wird im Browser auf ein kleines Quadrat gerechnet; waehrend das
 * laeuft, steht ein Platzhalter an seiner Stelle.
 */
function AvatarPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await fileToAvatar(file));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Bild nicht lesbar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inset flex items-center gap-3 p-3">
      <Avatar name={name || "?"} src={value} size={52} loading={busy} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold">Profilbild</p>
        <p className="muted text-[12px] leading-snug">
          Erscheint an der Tür bei „zuletzt hier war …“.
        </p>
        {error && <p className="mt-1 text-[12px] font-semibold text-danger">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        <label className="btn btn-ghost btn-sm btn-pill cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          {value ? "Ändern" : "Wählen"}
        </label>
        {value && (
          <button
            type="button"
            className="btn btn-plain btn-sm btn-pill"
            onClick={() => onChange("")}
          >
            Entfernen
          </button>
        )}
      </div>
    </div>
  );
}
