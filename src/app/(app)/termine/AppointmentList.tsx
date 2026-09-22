"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppointmentRow } from "@/lib/queries";
import { StatTile } from "@/components/ui";
import { routeUrl } from "@/lib/map";
import { slotLabel, slotOverdue, slotToday } from "@/lib/appointments";

/**
 * Vereinbarte Termine - der Rückweg des Tages.
 *
 * Ein Termin ist die zweitbeste Sache nach dem Abschluss, verfällt aber, wenn
 * ihn niemand mehr sieht. Deshalb stehen überfällige oben und lassen sich von
 * hier aus direkt anrufen.
 */
export function AppointmentList({
  appointments,
  isLeader,
}: {
  appointments: AppointmentRow[];
  isLeader: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  /* Was "heute" ist, entscheidet die Uhr des Geräts - nicht die des Servers. */
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  async function setDone(id: number, done: boolean) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/visits/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? "Konnte nicht gespeichert werden.");
        return;
      }
      router.refresh();
    } catch {
      setError("Keine Verbindung.");
    } finally {
      setBusy(null);
    }
  }

  const open = appointments.filter((item) => !item.follow_up_done_at);
  const done = appointments.filter((item) => item.follow_up_done_at);
  const overdue = now ? open.filter((item) => slotOverdue(item.follow_up_at, now)) : [];
  const today = now
    ? open.filter(
        (item) => slotToday(item.follow_up_at, now) && !slotOverdue(item.follow_up_at, now),
      )
    : [];

  return (
    <div>
      <div className="mb-5 grid grid-cols-3 gap-2">
        <StatTile label="Offen" value={open.length} />
        <StatTile label="Heute" value={now ? today.length : "–"} tone="brand" />
        <StatTile label="Überfällig" value={now ? overdue.length : "–"} tone="danger" />
      </div>

      {error && (
        <p className="mb-3 text-sm font-medium text-signal-600" role="alert">
          {error}
        </p>
      )}

      <section className="card p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">
            {isLeader ? "Termine des Teams" : "Meine Termine"} ({open.length})
          </h2>
          {done.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="muted shrink-0 text-xs font-semibold underline"
            >
              {showDone ? "erledigte ausblenden" : `${done.length} erledigt`}
            </button>
          )}
        </div>

        {open.length === 0 ? (
          <p className="muted text-sm">
            Kein offener Termin. Termine entstehen an der Tür über „Termin vereinbart“.
          </p>
        ) : (
          <ul className="space-y-2">
            {open.map((item) => {
              const late = slotOverdue(item.follow_up_at, now ?? undefined);
              return (
                <li
                  key={item.id}
                  className="rounded-xl border p-2.5 hairline"
                  style={late ? { borderColor: "var(--signal-400)" } : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold tabular-nums"
                      style={{
                        background: late
                          ? "color-mix(in srgb, var(--signal-500) 15%, transparent)"
                          : "color-mix(in srgb, var(--brand-500) 14%, transparent)",
                        color: late ? "var(--signal-600)" : "var(--brand-600)",
                      }}
                    >
                      {now ? slotLabel(item.follow_up_at, now) : item.follow_up_at}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.contact_name || "Ohne Namen"}
                        <span className="muted font-normal">
                          {" · "}
                          {item.street_name ?? ""} {item.house_number}
                          {item.doorbell_label ? ` · ${item.doorbell_label}` : ""}
                        </span>
                      </p>
                      <p className="muted truncate text-xs">
                        {item.user_name}
                        {item.reason_note ? ` · ${item.reason_note}` : ""}
                      </p>
                    </div>
                  </div>
                  {/* Eigene Zeile: auf dem Handy quetschen Knöpfe sonst den Namen weg. */}
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    {item.contact_phone && (
                      <a
                        href={`tel:${item.contact_phone.replace(/[^+\d]/g, "")}`}
                        className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold hairline"
                      >
                        📞 anrufen
                      </a>
                    )}
                    {item.lat !== null && item.lng !== null && (
                      <a
                        href={routeUrl(item.lat, item.lng)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold hairline"
                      >
                        ➤ Route
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={busy === item.id}
                      onClick={() => void setDone(item.id, true)}
                      className="btn btn-ghost px-3 py-1.5 text-xs"
                    >
                      erledigt
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {showDone && done.length > 0 && (
          <ul className="mt-3 space-y-1 border-t pt-3 hairline">
            {done.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <span className="muted w-24 shrink-0 text-xs tabular-nums">
                  {now ? slotLabel(item.follow_up_at, now) : item.follow_up_at}
                </span>
                <span className="muted min-w-0 flex-1 truncate line-through">
                  {item.contact_name || "Ohne Namen"} · {item.street_name ?? ""}{" "}
                  {item.house_number}
                </span>
                <button
                  type="button"
                  onClick={() => void setDone(item.id, false)}
                  className="muted shrink-0 text-xs underline"
                >
                  wieder öffnen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
