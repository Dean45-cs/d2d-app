"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconPlus } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { fileToAvatar } from "@/lib/avatar";
import type { User } from "@/lib/types";

type Row = User & {
  doors: number;
  met: number;
  sales: number;
  territories: string[];
};

export function TeamTable({
  rows,
  currentUserId,
}: {
  rows: Row[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "MEMBER",
    avatar: "",
  });

  async function createMember(event: React.FormEvent) {
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
      setOpen(false);
      setForm({ name: "", email: "", phone: "", password: "", role: "MEMBER", avatar: "" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, body: Record<string, unknown>) {
    const response = await fetch(`/api/team/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error ?? "Änderung nicht möglich");
      return false;
    }
    router.refresh();
    return true;
  }

  async function submitPassword(id: number) {
    if (newPassword.length < 8) {
      alert("Das Passwort braucht mindestens 8 Zeichen.");
      return;
    }
    if (await patch(id, { password: newPassword })) {
      setResetFor(null);
      setNewPassword("");
      alert("Neues Passwort gesetzt. Bitte dem Mitarbeiter mitteilen.");
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <IconPlus className="h-4 w-4" />
          Mitarbeiter anlegen
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((m) => (
          <div key={m.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar name={m.name} src={m.avatar} size={44} />
                <div className="min-w-0">
                <p className="font-semibold">
                  {m.name}
                  {m.role === "LEADER" && (
                    <span className="badge ml-2 bg-brand-500/15 text-brand-600">
                      Teamleitung
                    </span>
                  )}
                  {!m.active && (
                    <span className="badge ml-2 bg-signal-500/15 text-signal-600">
                      Deaktiviert
                    </span>
                  )}
                </p>
                <p className="muted text-[13px]">{m.email}</p>
                {m.phone && <p className="muted text-[13px]">{m.phone}</p>}
                {m.territories.length > 0 && (
                  <p className="muted mt-1 text-xs">
                    Gebiete: {m.territories.join(", ")}
                  </p>
                )}
                </div>
              </div>

              <div className="muted flex gap-4 text-center text-xs">
                <div>
                  <span className="block text-base font-bold text-[var(--ink)] tabular-nums">
                    {m.doors}
                  </span>
                  Türen
                </div>
                <div>
                  <span className="block text-base font-bold text-[var(--ink)] tabular-nums">
                    {m.met}
                  </span>
                  angetroffen
                </div>
                <div>
                  <span className="block text-base font-bold text-energy-600 tabular-nums">
                    {m.sales}
                  </span>
                  Abschlüsse
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3 hairline">
              <AvatarButton
                name={m.name}
                hasImage={Boolean(m.avatar)}
                onPick={(avatar) => patch(m.id, { avatar })}
              />
              <button
                className="btn btn-ghost btn-sm btn-pill"
                onClick={() => setResetFor(resetFor === m.id ? null : m.id)}
              >
                Passwort neu setzen
              </button>
              {m.id !== currentUserId && (
                <>
                  <button
                    className="btn btn-ghost btn-sm btn-pill"
                    onClick={() =>
                      patch(m.id, { role: m.role === "LEADER" ? "MEMBER" : "LEADER" })
                    }
                  >
                    {m.role === "LEADER" ? "Zu Vertrieb machen" : "Zur Teamleitung machen"}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm btn-pill"
                    onClick={() => patch(m.id, { active: !m.active })}
                  >
                    {m.active ? "Deaktivieren" : "Wieder aktivieren"}
                  </button>
                </>
              )}
            </div>

            {resetFor === m.id && (
              <div className="mt-3 flex gap-2">
                <input
                  className="input"
                  type="text"
                  placeholder="Neues Passwort (min. 8 Zeichen)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  className="btn btn-primary shrink-0"
                  onClick={() => submitPassword(m.id)}
                >
                  Setzen
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/45 md:items-center md:justify-center"
          onClick={() => setOpen(false)}
        >
          <form
            onSubmit={createMember}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-[var(--card)] p-5 pb-8 md:max-w-md md:rounded-3xl"
          >
            <h2 className="mb-4 text-lg font-bold">Mitarbeiter anlegen</h2>
            <div className="space-y-3">
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
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="m-mail">E-Mail (Login)</label>
                <input
                  id="m-mail"
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="m-phone">Telefon</label>
                <input
                  id="m-phone"
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="m-pw">Startpasswort</label>
                <input
                  id="m-pw"
                  className="input"
                  type="text"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
                <p className="muted mt-1 text-xs">
                  Mindestens 8 Zeichen. Der Mitarbeiter kann es sich von dir jederzeit
                  neu setzen lassen.
                </p>
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

            {error && (
              <p className="mt-3 rounded-xl bg-signal-500/10 px-3 py-2 text-sm font-medium text-signal-600">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button type="button" className="btn btn-ghost flex-1" onClick={() => setOpen(false)}>
                Abbrechen
              </button>
              <button className="btn btn-primary flex-1" disabled={busy}>
                {busy ? "Anlegen …" : "Anlegen"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
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
      <Avatar name={name || "?"} src={value} size={56} loading={busy} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">Profilbild</p>
        <p className="muted text-[11px] leading-snug">
          Erscheint an der Tür bei „zuletzt hier war …“.
        </p>
        {error && <p className="mt-1 text-[11px] font-semibold text-signal-600">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        <label className="btn btn-ghost btn-sm btn-pill cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          {value ? "ändern" : "wählen"}
        </label>
        {value && (
          <button
            type="button"
            className="btn btn-plain btn-sm btn-pill"
            onClick={() => onChange("")}
          >
            weg
          </button>
        )}
      </div>
    </div>
  );
}

/** Profilbild einer vorhandenen Person tauschen. */
function AvatarButton({
  name,
  hasImage,
  onPick,
}: {
  name: string;
  hasImage: boolean;
  onPick: (avatar: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onPick(await fileToAvatar(file));
    } catch (problem) {
      alert(problem instanceof Error ? problem.message : "Bild nicht lesbar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label
      className="btn btn-ghost btn-sm btn-pill cursor-pointer"
      aria-label={`Profilbild von ${name} ${hasImage ? "ändern" : "setzen"}`}
    >
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {busy ? "Bild wird verkleinert …" : hasImage ? "Profilbild ändern" : "Profilbild setzen"}
    </label>
  );
}
