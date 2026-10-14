"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { User } from "@/lib/types";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Cell, InlineError, ListLabel, Segmented } from "@/components/ui";
import { IconCalendar, IconCheck } from "@/components/icons";

interface Props {
  territory: {
    id: number;
    status: string;
    assigned_user_id: number | null;
    assignee_name: string | null;
    due_date: string | null;
  };
  members: User[];
  openAppointments: number;
  canTransferAppointments: boolean;
  canAssign: boolean;
  canStatus: boolean;
}

type Status = "OPEN" | "ACTIVE" | "PAUSED" | "DONE";

const STATUS_OPTIONS: Array<{ value: Status; label: string }> = [
  { value: "OPEN", label: "Offen" },
  { value: "ACTIVE", label: "In Arbeit" },
  { value: "PAUSED", label: "Pause" },
  { value: "DONE", label: "Fertig" },
];

/**
 * Wer ist dran, bis wann, wie weit: Zuteilung als Zeile (Tippen oeffnet
 * die Uebergabe), Status als Segmentleiste - ein Tipp, kein Speichern.
 */
export function TerritoryControls({
  territory,
  members,
  canAssign,
  canStatus,
  openAppointments,
  canTransferAppointments,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<Status>(territory.status as Status);
  const [handover, setHandover] = useState(false);

  async function changeStatus(next: Status) {
    const previous = status;
    setStatus(next);
    const response = await fetch(`/api/territories/${territory.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    if (!response?.ok) {
      setStatus(previous);
      const data = await response?.json().catch(() => ({}));
      toast(data?.error ?? "Status nicht gespeichert");
      return;
    }
    router.refresh();
  }

  const dueDate = territory.due_date ? new Date(territory.due_date) : null;
  const due = dueDate
    ? dueDate.toLocaleDateString("de-DE", {
        day: "numeric",
        month: "short",
        // Das Jahr nur, wenn es nicht das laufende ist.
        ...(dueDate.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
      })
    : null;

  return (
    <section>
      <ListLabel>Zuteilung</ListLabel>
      <ul className="list list-icons">
        <li>
          <Cell
            onClick={canAssign ? () => setHandover(true) : undefined}
            icon={<Avatar name={territory.assignee_name} size={32} />}
            title={territory.assignee_name ?? "Nicht zugeteilt"}
            detail={canAssign ? (territory.assignee_name ? "Übergeben" : "Zuteilen") : undefined}
            chevron={canAssign}
          />
        </li>
        {due && (
          <li>
            <Cell
              icon={
                <span className="glyph">
                  <IconCalendar className="h-4 w-4" />
                </span>
              }
              title="Fällig"
              detail={due}
            />
          </li>
        )}
      </ul>

      <ListLabel>Status</ListLabel>
      {canStatus ? (
        <Segmented ariaLabel="Status des Gebiets" options={STATUS_OPTIONS} value={status} onChange={changeStatus} />
      ) : (
        <ul className="list">
          <li>
            <Cell title={STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status} />
          </li>
        </ul>
      )}

      {handover && (
        <HandoverSheet
          territory={territory}
          members={members}
          openAppointments={openAppointments}
          canTransferAppointments={canTransferAppointments}
          onClose={() => setHandover(false)}
        />
      )}
    </section>
  );
}

/**
 * Uebergabe an jemand anderen. Arbeitsstand, Versuche und Sperren bleiben;
 * offene Termine bleiben bei den bisherigen Verantwortlichen oder wandern mit.
 */
function HandoverSheet({
  territory,
  members,
  openAppointments,
  canTransferAppointments,
  onClose,
}: {
  territory: Props["territory"];
  members: User[];
  openAppointments: number;
  canTransferAppointments: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [next, setNext] = useState<number | null>(territory.assigned_user_id);
  // Offene Termine: bewusst entscheiden lassen, nichts vorwaehlen.
  const [policy, setPolicy] = useState<"KEEP" | "TRANSFER" | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = next !== territory.assigned_user_id;
  const needsPolicy = changed && openAppointments > 0 && next !== null;
  const candidates = members.filter((m) => m.active);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/territories/${territory.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignedUserId: next,
          expectedAssignedUserId: territory.assigned_user_id,
          appointmentPolicy: next === null ? "KEEP" : policy || "KEEP",
          handoverNote: note,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Übergabe nicht gespeichert.");
        return;
      }
      toast(next === null ? "Zuteilung aufgehoben" : "Gebiet übergeben");
      onClose();
      router.refresh();
    } catch {
      setError("Keine Verbindung – die Zuteilung bleibt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Zuteilen"
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={save} disabled={busy || !changed || (needsPolicy && !policy)}>
            {busy ? "Speichern …" : next === null ? "Zuteilung aufheben" : "Übergeben"}
          </button>
        </div>
      }
    >
      <ul className="list list-icons" role="radiogroup" aria-label="Person">
        {[null, ...candidates.map((m) => m.id)].map((id) => {
          const member = candidates.find((m) => m.id === id);
          const selected = next === id;
          return (
            <li key={id ?? "none"}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className="cell cell-tap"
                onClick={() => setNext(id)}
              >
                <Avatar name={member?.name ?? null} src={member?.avatar} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body">{member?.name ?? "Niemand"}</span>
                  {member?.role === "LEADER" && <span className="block text-footnote text-muted">Leitung</span>}
                </span>
                {selected && <IconCheck className="h-5 w-5 shrink-0 text-accent-ink" />}
              </button>
            </li>
          );
        })}
      </ul>

      {needsPolicy && (
        <>
          <ListLabel>{openAppointments === 1 ? "Offener Termin" : `${openAppointments} offene Termine`}</ListLabel>
          <Segmented<"KEEP" | "TRANSFER" | "">
            ariaLabel="Offene Termine"
            value={policy}
            onChange={setPolicy}
            options={[
              { value: "KEEP", label: "Bleiben" },
              ...(canTransferAppointments ? [{ value: "TRANSFER" as const, label: "Wandern mit" }] : []),
            ]}
          />
        </>
      )}

      {changed && (
        <>
          <ListLabel>Notiz</ListLabel>
          <label className="sr-only" htmlFor="handover-note">
            Übergabenotiz
          </label>
          <textarea
            id="handover-note"
            className="field min-h-24"
            rows={3}
            maxLength={1000}
            placeholder="Optional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </>
      )}
    </Sheet>
  );
}
