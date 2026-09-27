"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconChevronDown, IconChevronUp, IconPlus } from "@/components/icons";
import { Note, SectionHeader, Switch } from "@/components/ui";
import type { RejectionReason } from "@/lib/types";

export function ReasonSettings({ reasons }: { reasons: RejectionReason[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
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
    } catch {
      setError("Keine Verbindung – bitte gleich noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function update(reason: RejectionReason, body: Record<string, unknown>) {
    setPending(reason.id);
    try {
      await fetch(`/api/reasons/${reason.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const visible = reasons.filter((r) => r.active).length;

  return (
    <section className="card p-5">
      <SectionHeader title="Ablehnungsgründe" count={visible} className="mb-1" />
      <p className="muted mb-4 text-[13px] leading-snug">
        Diese Gründe sieht das Team an der Tür. Acht bis zwölf lassen sich gut mit einem Daumen
        bedienen.
      </p>

      <ul className="list mb-4">
        {reasons.map((reason, index) => (
          <li key={reason.id} className="flex items-center gap-2.5 px-3 py-2.5 sm:gap-3">
            <span
              className={`tile-icon h-8 w-8 shrink-0 text-[16px] sm:h-9 sm:w-9 sm:text-[18px] ${reason.active ? "" : "opacity-40"}`}
              style={{ background: "color-mix(in srgb, var(--ink) 6%, transparent)" }}
              aria-hidden
            >
              {reason.emoji || "·"}
            </span>
            <span className={`min-w-0 flex-1 ${reason.active ? "" : "opacity-50"}`}>
              <span className="line-clamp-2 block text-[14px] font-medium leading-snug">
                {reason.label}
              </span>
              {reason.hint && (
                <span className="muted block truncate text-[12px]">{reason.hint}</span>
              )}
            </span>
            <span className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => update(reason, { sortOrder: reason.sort_order - 1.5 })}
                disabled={index === 0 || pending === reason.id}
                className="icon-btn h-8 w-8"
                aria-label={`${reason.label} nach oben`}
                title="Nach oben"
              >
                <IconChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => update(reason, { sortOrder: reason.sort_order + 1.5 })}
                disabled={index === reasons.length - 1 || pending === reason.id}
                className="icon-btn h-8 w-8"
                aria-label={`${reason.label} nach unten`}
                title="Nach unten"
              >
                <IconChevronDown className="h-4 w-4" />
              </button>
            </span>
            <Switch
              checked={Boolean(reason.active)}
              onChange={(on) => update(reason, { active: on ? 1 : 0 })}
              label={`${reason.label} an der Tür anzeigen`}
              disabled={pending === reason.id}
            />
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="flex gap-2">
        <input
          className="input w-14 shrink-0 px-0 text-center"
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
        <button className="btn btn-primary shrink-0" disabled={busy} aria-label="Grund hinzufügen">
          <IconPlus className="h-4 w-4" />
          <span className="hidden sm:inline">Hinzufügen</span>
        </button>
      </form>
      {error && (
        <div className="mt-2">
          <Note tone="danger">{error}</Note>
        </div>
      )}
    </section>
  );
}
