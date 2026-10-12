"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Note, PageHeader, Pill, SectionHeader } from "@/components/ui";
import type { InvitationRow } from "@/lib/invitations";

export function Invitations({ own, approvals, approver, problem, reports, canCreate }: {
  own: InvitationRow[]; approvals: InvitationRow[]; approver: string | null; problem: string | null;
  reports: { id: number; name: string }[]; canCreate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");

  async function mutate(url: string, method: string, body?: object) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Aktion fehlgeschlagen.");
      if (data.token) setShareUrl(`${window.location.origin}/einladung/${data.token}`);
      else setMessage(method === "DELETE" ? "Link widerrufen." : "Entscheidung gespeichert.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Keine Verbindung. Bitte erneut versuchen."); }
    finally { setBusy(false); }
  }

  async function copy(token?: string) {
    const url = token ? `${window.location.origin}/einladung/${token}` : shareUrl;
    setShareUrl(url);
    try { await navigator.clipboard.writeText(url); setMessage("Link kopiert."); }
    catch { setMessage("Bitte den Link im Feld markieren und kopieren."); }
  }

  return <div className="mx-auto max-w-3xl space-y-6">
    <PageHeader title="Einladungen" subtitle="Gemeinsam deine Struktur aufbauen" action={
      <button className="btn btn-primary" disabled={busy || !!problem || !canCreate} onClick={() => void mutate("/api/invitations", "POST")}>Link erstellen</button>
    } />
    <div className="card space-y-3 p-5">
      <h2 className="font-semibold">So kommt jemand in dein Team</h2>
      <p className="muted text-sm">Teile einen Link. Die eingeladene Person registriert sich und wird dir direkt zugeordnet, sobald deine Führungskraft den Beitritt freigibt.</p>
      {!canCreate && <Note tone="warn">Du hast keine Berechtigung, neue Einladungen zu erstellen.</Note>}
      {problem ? <Note tone="warn">{problem}</Note> : <p className="text-sm">Freigabe durch <strong>{approver}</strong>. An der Strukturspitze gibt die Teamleitung ihre eigenen Einladungen frei.</p>}
      <p className="muted text-xs">Jeder Link gilt 7 Tage und für eine Person. Ohne Freigabe gibt es keinen Zugang.</p>
    </div>
    {error && <div role="alert"><Note tone="danger">{error}</Note></div>}
    {message && <div role="status"><Note tone="success">{message}</Note></div>}
    {shareUrl && <div className="card space-y-3 p-5">
      <label className="label" htmlFor="share-link">Dein Einladungslink</label>
      <input id="share-link" className="input" readOnly value={shareUrl} onFocus={(event) => event.target.select()} />
      <button className="btn btn-primary" onClick={() => void copy()}>Link kopieren</button>
    </div>}
    <section>
      <SectionHeader title="Warten auf deine Freigabe" count={approvals.length} />
      {approvals.length === 0 ? <p className="muted text-sm">Keine offenen Anfragen.</p> : <ul className="list">
        {approvals.map((row) => <li key={row.request_id} className="space-y-3 border-b border-[var(--line)] p-4 last:border-0">
          <div><p className="font-semibold">{row.name}</p><p className="muted break-words text-sm">{row.email}</p><p className="muted text-sm">Eingeladen von {row.inviter_name} · wird {row.inviter_name} direkt zugeordnet</p></div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void mutate(`/api/invitations/${row.request_id}`, "PATCH", { decision: "APPROVED" })}>Freigeben</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void mutate(`/api/invitations/${row.request_id}`, "PATCH", { decision: "REJECTED" })}>Ablehnen</button>
          </div>
        </li>)}
      </ul>}
    </section>
    <section>
      <SectionHeader title="Meine Einladungen" count={own.length} />
      {own.length === 0 ? <p className="muted text-sm">Erstelle deinen ersten Link und lade jemanden ein.</p> : <ul className="list">
        {own.map((row) => {
          const expired = new Date(row.expires_at.replace(" ", "T") + "Z").getTime() <= Date.now();
          const usable = !row.status && !row.revoked_at && !expired;
          const label = row.status === "PENDING" ? "Wartet auf Freigabe" : row.status === "APPROVED" ? "Freigegeben" : row.status === "REJECTED" ? "Abgelehnt" : row.revoked_at ? "Widerrufen" : expired ? "Abgelaufen" : "Bereit zum Teilen";
          return <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-4 last:border-0">
            <div className="min-w-0"><p className="font-semibold">{row.name || `Einladung #${row.id}`}</p>
              {row.email && <p className="muted break-words text-sm">{row.email}</p>}
              <Pill tone={row.status === "APPROVED" ? "success" : row.status === "PENDING" ? "warn" : "neutral"}>{label}</Pill>
              {usable && <p className="muted mt-1 text-xs">Gültig bis {new Date(row.expires_at.replace(" ", "T") + "Z").toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}</p>}
            </div>
            {usable && <div className="flex gap-2">
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void copy(row.token)}>Kopieren</button>
              <button className="btn btn-plain btn-sm" disabled={busy} onClick={() => { setShareUrl(""); void mutate(`/api/invitations/${row.id}`, "DELETE"); }}>Widerrufen</button>
            </div>}
          </li>;
        })}
      </ul>}
    </section>
    <section>
      <SectionHeader title="Direkt unter dir" count={reports.length} />
      {reports.length === 0 ? <p className="muted text-sm">Dir ist noch niemand direkt zugeordnet.</p> : <ul className="list">
        {reports.map((person) => <li key={person.id}><Link className="list-row" href={`/profil/${person.id}`}>{person.name}</Link></li>)}
      </ul>}
    </section>
  </div>;
}
