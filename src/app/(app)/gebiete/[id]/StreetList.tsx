"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StreetWithStats } from "@/lib/queries";
import { IconPlus } from "@/components/icons";
import { ProgressBar } from "@/components/ui";
import { routeUrl } from "@/lib/map";

export function StreetList({
  territoryId,
  streets,
  isLeader,
}: {
  territoryId: number;
  streets: StreetWithStats[];
  isLeader: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addStreets(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/territories/${territoryId}/streets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ streets: raw }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Straßen konnten nicht gespeichert werden.");
        return;
      }
      setRaw("");
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(streetId: number, status: string) {
    await fetch(`/api/streets/${streetId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function remove(streetId: number) {
    if (!confirm("Diese Straße wirklich aus dem Gebiet entfernen?")) return;
    await fetch(`/api/streets/${streetId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Straßen ({streets.length})</p>
        {isLeader && (
          <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => setAdding((v) => !v)}>
            <IconPlus className="h-4 w-4" />
            Straßen hinzufügen
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={addStreets} className="mb-4 rounded-xl border p-3 hairline">
          <label className="label" htmlFor="street-input">
            Eine Straße pro Zeile
          </label>
          <textarea
            id="street-input"
            className="textarea font-mono text-sm"
            rows={5}
            placeholder={"Bahnhofstraße 1-45; 30 WE\nGartenweg"}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            required
          />
          {error && <p className="mt-2 text-sm font-medium text-signal-600">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-ghost flex-1" onClick={() => setAdding(false)}>
              Abbrechen
            </button>
            <button className="btn btn-primary flex-1" disabled={busy}>
              {busy ? "Speichern …" : "Hinzufügen"}
            </button>
          </div>
        </form>
      )}

      {streets.length === 0 ? (
        <p className="muted py-6 text-center text-sm">
          Noch keine Straßen in diesem Gebiet.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
          {streets.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {s.name}{" "}
                  {s.house_numbers && (
                    <span className="muted font-normal">{s.house_numbers}</span>
                  )}
                </p>
                <p className="muted text-xs tabular-nums">
                  {/* Kurz halten: der Fortschritt ist die wichtigste Zahl. */}
                  {s.units > 0
                    ? `${s.visit_count} von ${s.units} Türen`
                    : `${s.visit_count} Türen`}
                  {s.sale_count > 0 && ` · ${s.sale_count} Abschlüsse`}
                </p>
                {s.units > 0 && (
                  <div className="mt-1 max-w-40">
                    <ProgressBar
                      value={s.visit_count}
                      max={s.units}
                      tone={s.status === "DONE" ? "success" : "brand"}
                    />
                  </div>
                )}
              </div>

              {s.lat !== null && s.lng !== null && (
                <a
                  href={routeUrl(s.lat, s.lng)}
                  target="_blank"
                  rel="noreferrer"
                  className="muted shrink-0 px-1 text-base leading-none hover:text-brand-600"
                  title={`Route zur ${s.name}`}
                  aria-label={`Route zur ${s.name}`}
                >
                  ➤
                </a>
              )}

              {/* Das Auswahlfeld zeigt den Status schon an - eine zusaetzliche
                  Plakette daneben waere doppelt und kostet auf dem Handy Platz. */}
              <select
                className="select w-auto shrink-0 px-2 py-1 text-xs"
                value={s.status}
                onChange={(e) => setStatus(s.id, e.target.value)}
                aria-label={`Status von ${s.name}`}
              >
                <option value="OPEN">Offen</option>
                <option value="ACTIVE">In Arbeit</option>
                <option value="DONE">Fertig</option>
              </select>

              {isLeader && (
                <button
                  onClick={() => remove(s.id)}
                  className="muted shrink-0 px-1 text-lg leading-none hover:text-signal-600"
                  aria-label={`${s.name} entfernen`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
