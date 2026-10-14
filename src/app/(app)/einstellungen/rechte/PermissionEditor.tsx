"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Note, PageHeader, Pill } from "@/components/ui";
import { PERMISSIONS, type Permission, type PermissionOverrides, type PermissionSet } from "@/lib/permission-definitions";
import type { Role } from "@/lib/types";

type Member = { id: number; name: string; role: Role; active: number; effective: PermissionSet; overrides: PermissionOverrides };
export function PermissionEditor({ members, grantable }: { members: Member[]; grantable: PermissionSet }) {
  const router = useRouter();
  const [selected, setSelected] = useState(members[0]?.id ?? 0);
  const [changes, setChanges] = useState<Partial<Record<Permission, boolean | null>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const member = members.find((person) => person.id === selected);

  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/team/${selected}/permissions`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ permissions: changes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Berechtigungen konnten nicht gespeichert werden.");
      setChanges({}); setMessage("Berechtigungen gespeichert. Die Änderung gilt ab der nächsten Anfrage."); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Keine Verbindung. Bitte erneut versuchen."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-3xl space-y-5">
    <PageHeader title="Berechtigungen" subtitle="Rechte gezielt vergeben und entziehen" />
    <Note tone="brand">Ab einer aktiven Person in der eigenen Struktur sind eigene Gebiete automatisch erlaubt. Verantwortliche können innerhalb ihrer Struktur Rechte vergeben, die sie selbst besitzen. „Standard“ folgt der Rolle und der aktuellen Struktur; „Entziehen“ hat Vorrang vor automatischen Rechten.</Note>
    {error && <div role="alert"><Note tone="danger">{error}</Note></div>}
    {message && <div role="status"><Note tone="success">{message}</Note></div>}
    {!member ? <p className="muted">In deiner verwaltbaren Struktur gibt es noch keine anderen Mitglieder.</p> : <>
      <div className="card p-5">
        <label className="label" htmlFor="permission-member">Person</label>
        <select id="permission-member" className="select" value={selected} disabled={busy} onChange={(event) => { setSelected(Number(event.target.value)); setChanges({}); setError(""); setMessage(""); }}>
          {members.map((person) => <option key={person.id} value={person.id}>{person.name}{person.active ? "" : " (deaktiviert)"}</option>)}
        </select>
      </div>
      {Array.from(new Set(PERMISSIONS.map((item) => item.group))).map((group) => <section key={group} className="card p-5">
        <h2 className="mb-3 font-semibold">{group}</h2>
        <div className="divide-y divide-[var(--line)]">{PERMISSIONS.filter((item) => item.group === group).map(({ key, label, description }) => {
          const value = key in changes ? changes[key] : member.overrides[key];
          return <div key={key} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1"><label className="font-medium text-sm" htmlFor={`permission-${key}`}>{label}</label><p className="muted mt-1 text-xs leading-relaxed">{description}</p>
              <div className="mt-2"><Pill tone={member.effective[key] ? "success" : "neutral"}>Aktuell {member.effective[key] ? "erlaubt" : "nicht erlaubt"}</Pill></div>
            </div>
            <select id={`permission-${key}`} className="select w-full shrink-0 sm:w-40" disabled={busy || !grantable[key] || (key === "team.roles" && member.role !== "LEADER")} value={value === true ? "allow" : value === false ? "deny" : "default"}
              onChange={(event) => setChanges((current) => ({ ...current, [key]: event.target.value === "default" ? null : event.target.value === "allow" }))}>
              <option value="default">Standard</option><option value="allow">Erlauben</option><option value="deny">Entziehen</option>
            </select>
          </div>;
        })}</div>
      </section>)}
      <div className="sticky bottom-24 flex items-center justify-end gap-3 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--card)] p-4 lg:bottom-4">
        <button className="btn btn-ghost" disabled={busy || !Object.keys(changes).length} onClick={() => setChanges({})}>Verwerfen</button>
        <button className="btn btn-primary" disabled={busy || !Object.keys(changes).length} onClick={() => void save()}>{busy ? "Speichern …" : "Rechte speichern"}</button>
      </div>
    </>}
  </div>;
}
