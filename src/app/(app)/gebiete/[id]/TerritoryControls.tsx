"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { User } from "@/lib/types";

interface Props {
  territory: {
    id: number;
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
    <div className="card mb-4 p-4">
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
              <option value="">– niemandem zugeteilt –</option>
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

      {!isLeader && (
        <p className="muted mt-2 text-xs">
          Melde das Gebiet auf „Fertig“, sobald du alle Straßen abgearbeitet hast.
        </p>
      )}
      {territory.due_date && (
        <p className="muted mt-2 text-xs">
          Zieltermin: {new Date(territory.due_date).toLocaleDateString("de-DE")}
        </p>
      )}
      {message && (
        <p className="mt-2 text-xs font-semibold text-energy-600">{message}</p>
      )}
    </div>
  );
}
