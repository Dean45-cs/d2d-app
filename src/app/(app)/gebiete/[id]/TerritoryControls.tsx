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
  isLeader: boolean;
}

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Offen" },
  { value: "ACTIVE", label: "In Arbeit" },
  { value: "PAUSED", label: "Pausiert" },
  { value: "DONE", label: "Fertig" },
];

export function TerritoryControls({ territory, members, isLeader }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

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
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(null), 2500);
    }
  }

  return (
    <div className="card mb-4 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {isLeader && (
          <div>
            <label className="label" htmlFor="assignee">
              Zugeteilt an
            </label>
            <select
              id="assignee"
              className="select"
              disabled={busy}
              value={territory.assigned_user_id ?? ""}
              onChange={(e) =>
                patch(
                  { assignedUserId: e.target.value ? Number(e.target.value) : null },
                  "Zuteilung gespeichert",
                )
              }
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
            disabled={busy}
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {territory.due_date && (
          <Pill tone="neutral">
            <IconClock className="h-3.5 w-3.5" />
            Bis {new Date(territory.due_date).toLocaleDateString("de-DE")}
          </Pill>
        )}
        {!isLeader && (
          <p className="muted text-[11px]">
            Melde das Gebiet auf „Fertig“, sobald du alle Straßen abgearbeitet hast.
          </p>
        )}
        <span className="flex-1" />
        {error && <span className="text-[12px] font-semibold text-danger">{error}</span>}
        {isLeader && (
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
