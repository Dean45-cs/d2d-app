"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HouseNumberWithStats, StreetWithStats } from "@/lib/queries";
import { IconPlus } from "@/components/icons";
import { ProgressBar } from "@/components/ui";
import { routeUrl } from "@/lib/map";
import { doorStatus, MAX_NOT_HOME_ATTEMPTS, whenLabel } from "@/lib/doors";

export function StreetList({
  territoryId,
  streets,
  numbers,
  isLeader,
}: {
  territoryId: number;
  streets: StreetWithStats[];
  /** Hausnummern je Strassen-ID, aus der Kartenauswahl uebernommen. */
  numbers: Record<number, HouseNumberWithStats[]>;
  isLeader: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [openStreet, setOpenStreet] = useState<number | null>(null);
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
          {streets.map((s) => {
            const houses = numbers[s.id] ?? [];
            const doneHouses = houses.filter((h) => h.visit_count > 0).length;
            const expanded = openStreet === s.id;
            return (
              <li key={s.id} className="py-2.5">
                <div className="flex items-center gap-2">
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

                  {houses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenStreet(expanded ? null : s.id)}
                      className="muted shrink-0 rounded-lg px-2 py-1 text-xs font-semibold hover:bg-brand-500/8"
                      aria-expanded={expanded}
                    >
                      {houses.length} Nr.
                      <span aria-hidden className="ml-1">{expanded ? "▾" : "▸"}</span>
                    </button>
                  )}

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
                </div>

                {expanded && (
                  <div className="mt-2">
                    <p className="muted mb-1.5 text-xs">
                      {doneHouses} von {houses.length} Häusern erfasst · grün = Abschluss
                    </p>
                    <ul className="flex flex-wrap gap-1">
                      {houses.map((house) => (
                        <li key={house.id}>
                          <HouseChip house={house} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Eine Hausnummer als Plakette: grau = offen, gelb = angefangen,
 * blau = erfasst, grün = Abschluss, rot = gesperrt.
 */
function HouseChip({ house }: { house: HouseNumberWithStats }) {
  // Ein Mehrfamilienhaus ist erst durch, wenn jede Klingel dran war - sonst
  // saehe die Gebietsuebersicht nach dem ersten Eintrag schon fertig aus.
  const mfh = house.building_type === "MFH";
  const status = doorStatus(house);
  const blocked = status === "BLOCKED";
  const retry = !mfh && status === "RETRY";
  const done = blocked
    ? true
    : mfh
      ? house.bell_count > 0 && house.bell_done_count >= house.bell_count
      : status === "DONE";
  const sale = house.sale_count > 0;
  const wasHere = house.last_visit_user
    ? `zuletzt ${house.last_visit_user}, ${whenLabel(house.last_visit_at)}`
    : null;
  return (
    <span
      className="inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-semibold tabular-nums"
      style={{
        background: blocked
          ? "color-mix(in srgb, var(--signal-500) 16%, transparent)"
          : retry
            ? "color-mix(in srgb, var(--gas-500) 18%, transparent)"
            : sale
              ? "color-mix(in srgb, var(--energy-500) 20%, transparent)"
              : done
                ? "color-mix(in srgb, var(--brand-500) 16%, transparent)"
                : "color-mix(in srgb, var(--ink) 7%, transparent)",
        color: blocked
          ? "var(--signal-600)"
          : retry
            ? "var(--gas-600)"
            : sale
              ? "var(--energy-700)"
              : done
                ? "var(--brand-600)"
                : "var(--ink-muted)",
      }}
      title={[
        `Hausnummer ${house.number}`,
        blocked
          ? `gesperrt${house.blocked_by_name ? ` von ${house.blocked_by_name}` : ""}${
              house.blocked_note ? ` – ${house.blocked_note}` : ""
            }`
          : null,
        mfh ? "Mehrfamilienhaus" : house.building_type === "EFH" ? "Einfamilienhaus" : null,
        mfh && house.bell_count > 0
          ? `${house.bell_done_count} von ${house.bell_count} Klingeln`
          : null,
        retry ? `${house.not_home_count} von ${MAX_NOT_HOME_ATTEMPTS} Versuchen` : null,
        house.units > 1 ? `${house.units} Wohneinheiten` : null,
        wasHere,
        blocked ? null : sale ? "Abschluss" : done ? "erfasst" : "offen",
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      {house.number}
      {blocked ? (
        <span className="ml-1 text-[10px] font-medium">🚫</span>
      ) : mfh ? (
        <span className="ml-1 text-[10px] font-medium opacity-70">
          {house.bell_count > 0 ? `${house.bell_done_count}/${house.bell_count}` : "🔔"}
        </span>
      ) : retry ? (
        <span className="ml-1 text-[10px] font-medium opacity-70">
          {house.not_home_count}/{MAX_NOT_HOME_ATTEMPTS}
        </span>
      ) : null}
    </span>
  );
}
