"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconPlus } from "@/components/icons";
import type { RejectionReason } from "@/lib/types";

export function ReasonSettings({ reasons }: { reasons: RejectionReason[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/reasons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, emoji }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Grund konnte nicht angelegt werden.");
        return;
      }
      setLabel("");
      setEmoji("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(reason: RejectionReason) {
    await fetch(`/api/reasons/${reason.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: reason.active ? 0 : 1 }),
    });
    router.refresh();
  }

  async function move(reason: RejectionReason, direction: -1 | 1) {
    await fetch(`/api/reasons/${reason.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortOrder: reason.sort_order + direction * 1.5 }),
    });
    router.refresh();
  }

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">Ablehnungsgründe</h2>
      <p className="muted mb-4 text-sm">
        Diese Kacheln sieht das Team an der Tür. Weniger ist mehr – acht bis zwölf
        Gründe lassen sich mit einem Daumen bedienen.
      </p>

      <ul className="mb-4 space-y-1.5">
        {reasons.map((reason, index) => (
          <li
            key={reason.id}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 hairline ${
              reason.active ? "" : "opacity-50"
            }`}
          >
            <span className="w-6 text-center text-lg">{reason.emoji || "💬"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{reason.label}</span>
              {reason.hint && (
                <span className="muted block truncate text-xs">{reason.hint}</span>
              )}
            </span>
            <button
              onClick={() => move(reason, -1)}
              disabled={index === 0}
              className="muted px-1 text-sm disabled:opacity-30"
              aria-label={`${reason.label} nach oben`}
            >
              ▲
            </button>
            <button
              onClick={() => move(reason, 1)}
              disabled={index === reasons.length - 1}
              className="muted px-1 text-sm disabled:opacity-30"
              aria-label={`${reason.label} nach unten`}
            >
              ▼
            </button>
            <button
              onClick={() => toggle(reason)}
              className="btn btn-ghost px-2.5 py-1 text-xs"
            >
              {reason.active ? "Ausblenden" : "Einblenden"}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          className="input w-16 text-center"
          placeholder="🙂"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          aria-label="Symbol"
        />
        <input
          className="input min-w-0 flex-1"
          placeholder="Neuer Grund, z. B. „Wohnt zur Untermiete“"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        <button className="btn btn-primary shrink-0" disabled={busy}>
          <IconPlus className="h-4 w-4" />
          Hinzufügen
        </button>
      </form>
      {error && <p className="mt-2 text-sm font-medium text-signal-600">{error}</p>}
    </section>
  );
}
