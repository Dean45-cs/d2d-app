"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { User } from "@/lib/types";
import { Pill } from "@/components/ui";
import { useConfirm } from "@/components/useConfirm";
import { IconCheck, IconClock, IconTrash } from "@/components/icons";

interface Props {
  territory: {
    id: number;
    name: string;
    status: string;
    assigned_user_id: number | null;
    assignee_name: string | null;
    due_date: string | null;
  };
  members: User[];
  openAppointments: number;
  canTransferAppointments: boolean;
  canAssign: boolean;
  canDelete: boolean;
  canStatus: boolean;
}

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Offen" },
  { value: "ACTIVE", label: "In Arbeit" },
  { value: "PAUSED", label: "Pausiert" },
  { value: "DONE", label: "Fertig" },
];

export function TerritoryControls({ territory, members, canAssign, canDelete, canStatus, openAppointments, canTransferAppointments }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const [nextAssignee, setNextAssignee] = useState<number | null | undefined>(undefined);
  const [appointmentPolicy, setAppointmentPolicy] = useState("");
  const [handoverNote, setHandoverNote] = useState("");

  async function remove() {
    const ok = await confirm({
      title: `„${territory.name}“ löschen?`,
      text: "Das Gebiet verschwindet samt Straßen und Fläche – die Fläche ist danach wieder frei. Bereits erfasste Türen und Abschlüsse bleiben in der Auswertung.",
      confirmLabel: "Gebiet löschen",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/territories/${territory.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Das Gebiet konnte nicht gelöscht werden.");
        return;
      }
      router.replace("/gebiete");
      router.refresh();
    } catch {
      setError("Keine Verbindung – bitte noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(body: Record<string, unknown>, note: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/territories/${territory.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      setMessage(response.ok ? note : (data.error ?? "Fehlgeschlagen"));
      if (response.ok) { setNextAssignee(undefined); setAppointmentPolicy(""); setHandoverNote(""); router.refresh(); }
    } catch {
      setError("Keine Verbindung – die Zuteilung wurde nicht geändert.");
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(null), 2500);
    }
  }

  return (
    <div className="card mb-4 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {canAssign && (
          <div>
            <label className="label" htmlFor="assignee">
              Zugeteilt an
            </label>
            <select
              id="assignee"
              className="select"
              disabled={busy}
              value={(nextAssignee === undefined ? territory.assigned_user_id : nextAssignee) ?? ""}
              onChange={(e) => { setNextAssignee(e.target.value ? Number(e.target.value) : null); setAppointmentPolicy(""); setError(null); }}
            >
              <option value="">Niemandem zugeteilt</option>
              {members
                .filter((m) => m.active)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.role === "LEADER" ? " (Leitung)" : ""}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            className="select"
            disabled={busy || !canStatus}
            value={territory.status}
            onChange={(e) => patch({ status: e.target.value }, "Status gespeichert")}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canAssign && nextAssignee !== undefined && nextAssignee !== territory.assigned_user_id && (
        <section className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <h3 className="font-semibold">Gebiet übergeben</h3>
          <p className="muted mt-1 text-[13px]">Der Arbeitsstand, bisherige Versuche und Sperren bleiben erhalten. Prüfe die Übergabeübersicht oben.</p>
          {openAppointments > 0 && <fieldset className="mt-3 space-y-2 text-[13px]" disabled={busy}>
            <legend className="mb-2 font-semibold">Wer übernimmt {openAppointments === 1 ? "den offenen Termin" : `die ${openAppointments} offenen Termine`}?</legend>
            <label className="flex items-center gap-2"><input type="radio" name="appointment-policy" value="KEEP" checked={appointmentPolicy === "KEEP"} onChange={() => setAppointmentPolicy("KEEP")} />Bei den bisherigen Verantwortlichen belassen</label>
            <label className="flex items-center gap-2"><input type="radio" name="appointment-policy" value="TRANSFER" checked={appointmentPolicy === "TRANSFER"} onChange={() => setAppointmentPolicy("TRANSFER")} disabled={!canTransferAppointments || nextAssignee === null} />An die neu zugeteilte Person übergeben</label>
            {!canTransferAppointments && <p className="muted">Für die Terminübergabe ist das Recht „Teamtermine“ erforderlich.</p>}
          </fieldset>}
          <label className="label mt-3" htmlFor="handover-note">Übergabenotiz (optional)</label>
          <textarea id="handover-note" className="input" rows={3} maxLength={1000} value={handoverNote} onChange={(e) => setHandoverNote(e.target.value)} disabled={busy} />
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy || (openAppointments > 0 && !appointmentPolicy)} onClick={() => void patch({
              assignedUserId: nextAssignee, expectedAssignedUserId: territory.assigned_user_id,
              appointmentPolicy: appointmentPolicy || "KEEP", handoverNote,
            }, "Gebiet übergeben")}>Übergabe speichern</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setNextAssignee(undefined)}>Abbrechen</button>
          </div>
        </section>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {territory.due_date && (
          <Pill tone="neutral">
            <IconClock className="h-3.5 w-3.5" />
            Bis {new Date(territory.due_date).toLocaleDateString("de-DE")}
          </Pill>
        )}
        {!canAssign && canStatus && (
          <p className="muted text-[11px]">
            Melde das Gebiet auf „Fertig“, sobald du alle Straßen abgearbeitet hast.
          </p>
        )}
        <span className="flex-1" />
        {error && <span className="text-[12px] font-semibold text-danger">{error}</span>}
        {canDelete && (
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-pill text-danger"
            onClick={() => void remove()}
            disabled={busy}
          >
            <IconTrash className="h-4 w-4" />
            Gebiet löschen
          </button>
        )}
        {message && (
          <span className="badge rise" style={{
            background: "color-mix(in srgb, var(--energy-500) 16%, transparent)",
            color: "var(--ok-ink)",
          }}>
            <IconCheck className="h-3.5 w-3.5" />
            {message}
          </span>
        )}
      </div>
      {dialog}
    </div>
  );
}
