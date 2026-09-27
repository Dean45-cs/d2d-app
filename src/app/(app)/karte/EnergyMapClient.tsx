"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, StatTile, euro } from "@/components/ui";
import { PriceBadge } from "@/components/ProviderRating";
import { MapView } from "@/components/map/MapView";
import { priceMarker } from "@/components/map/markers";
import type { LatLng, MapEngine } from "@/components/map/types";
import {
  PRICE_LEVELS,
  PRICE_SCALE,
  priceColor,
  priceScale,
  priceStep,
  type Energy,
} from "@/lib/energy/rating";

export interface MapPoint {
  plz: string;
  city: string;
  state: string;
  provider: string;
  lat: number;
  lng: number;
  stromCt: number | null;
  gasCt: number | null;
  stromYear: number | null;
  gasYear: number | null;
  isDemo: boolean;
}

interface Props {
  points: MapPoint[];
  refresh: {
    finished_at: string | null;
    status: string;
    source: string;
    row_count: number;
    message: string;
  } | null;
  isLeader: boolean;
  consumption: { strom: number; gas: number };
}

const GERMANY_POINTS: LatLng[] = [
  [47.3, 5.9],
  [55.05, 15.0],
];

function valueOf(point: MapPoint, energy: Energy): number | null {
  return energy === "strom" ? point.stromYear : point.gasYear;
}

export function EnergyMapClient({
  points,
  refresh,
  isLeader,
  consumption,
}: Props) {
  const router = useRouter();
  const [engine, setEngine] = useState<MapEngine | null>(null);

  const [energy, setEnergy] = useState<Energy>("strom");
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isDemo = points.length > 0 && points.every((p) => p.isDemo);

  /* ----------------------------- Kennzahlen ----------------------------- */

  const stats = useMemo(() => {
    const values = points
      .map((p) => valueOf(p, energy))
      .filter((v): v is number => v !== null);
    const scale = priceScale(values);
    const ranked = [...points]
      .filter((p) => valueOf(p, energy) !== null)
      .sort((a, b) => (valueOf(b, energy) ?? 0) - (valueOf(a, energy) ?? 0));
    return { values, med: scale.median, scale, ranked };
  }, [points, energy]);

  function colorFor(point: MapPoint): string {
    return priceColor(valueOf(point, energy), stats.scale);
  }

  /* -------------------------------- Karte -------------------------------- */

  // Anfangs ganz Deutschland zeigen - egal wie gross die Karte gerade ist.
  useEffect(() => {
    engine?.fit(GERMANY_POINTS, { padding: 8 });
  }, [engine]);

  // Pins bei Wechsel Strom/Gas oder Auswahl neu zeichnen
  useEffect(() => {
    if (!engine) return;
    const layer = engine.layer();
    for (const point of points) {
      const value = valueOf(point, energy);
      const diameter = value === null ? 10 : 14 + Math.min(12, Math.abs(value - stats.med) / 30);
      const isSelected = selected?.plz === point.plz;
      layer.marker([point.lat, point.lng], {
        ...priceMarker(colorFor(point), Math.round(diameter), isSelected),
        title: point.city,
        subtitle: `${point.provider || "Grundversorger unbekannt"} · ${
          value !== null ? `${euro(value)} / Jahr` : "keine Daten"
        }`,
        priority: isSelected ? 5 : 1,
        onClick: () => setSelected(point),
      });
    }
    return () => layer.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, points, energy, stats, selected]);

  function focus(point: MapPoint) {
    setSelected(point);
    engine?.setView([point.lat, point.lng], 10);
  }

  async function refreshNow() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/energy/refresh", { method: "POST" });
      const data = await response.json();
      setMessage(
        response.ok
          ? `Aktualisiert: ${data.rowCount} Postleitzahlen (${data.source})`
          : (data.error ?? data.message ?? "Aktualisierung fehlgeschlagen"),
      );
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------- Ansicht ------------------------------- */

  const selectedValue = selected ? valueOf(selected, energy) : null;
  const delta = selectedValue !== null ? Math.round(selectedValue - stats.med) : null;
  const selectedStep = selectedValue !== null ? priceStep(selectedValue, stats.scale) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Energiekarte"
        subtitle="Wo der Grundversorger besonders teuer ist, ist das Wechselargument am stärksten."
        action={
          isLeader ? (
            <button className="btn btn-ghost" onClick={refreshNow} disabled={busy}>
              {busy ? "Aktualisiere …" : "Jetzt aktualisieren"}
            </button>
          ) : undefined
        }
      />

      {points.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="font-semibold">Noch keine Preisdaten geladen</p>
          <p className="muted mx-auto mt-2 max-w-md text-sm">
            {isLeader
              ? "Klicke auf „Jetzt aktualisieren“ oder richte den täglichen Abruf ein (siehe README, Abschnitt Energiekarte)."
              : "Die Teamleitung muss die Preisquelle noch einmal laden."}
          </p>
        </div>
      ) : (
        <>
          {isDemo && (
            <div
              className="mb-4 rounded-xl px-4 py-3 text-sm"
              style={{
                background: "color-mix(in srgb, var(--gas-500) 14%, transparent)",
                color: "var(--gas-600)",
              }}
            >
              <strong>Demo-Daten.</strong> Die angezeigten Preise sind Beispielwerte,
              keine echten Grundversorgertarife. Echte Tagespreise erscheinen, sobald in{" "}
              <code>.env.local</code> eine Quelle unter <code>ENERGY_FEED_URL</code> hinterlegt ist.
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-xl border hairline">
              {(["strom", "gas"] as Energy[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setEnergy(option)}
                  className={`px-4 py-2 text-sm font-semibold ${
                    energy === option ? "bg-brand-600 text-white" : ""
                  }`}
                >
                  {option === "strom" ? "Strom" : "Gas"}
                </button>
              ))}
            </div>
            <p className="muted text-xs">
              Musterhaushalt:{" "}
              {energy === "strom"
                ? `${consumption.strom.toLocaleString("de-DE")} kWh Strom`
                : `${consumption.gas.toLocaleString("de-DE")} kWh Gas`}{" "}
              pro Jahr
            </p>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatTile label="Orte in der Karte" value={points.length} />
            <StatTile label="Median Jahreskosten" value={euro(stats.med)} />
            <StatTile
              label="Teuerster Ort"
              value={stats.ranked[0]?.city ?? "–"}
              hint={euro(valueOf(stats.ranked[0] ?? points[0], energy))}
              tone="danger"
            />
            <StatTile
              label="Günstigster Ort"
              value={stats.ranked[stats.ranked.length - 1]?.city ?? "–"}
              hint={euro(valueOf(stats.ranked[stats.ranked.length - 1] ?? points[0], energy))}
              tone="success"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="card overflow-hidden">
              <MapView
                className="h-[62vh] min-h-[380px] w-full"
                onEngine={setEngine}
                onFit={() => engine?.fit(GERMANY_POINTS, { padding: 8, animate: true })}
              />
              <div className="border-t px-4 pb-3 pt-2.5 hairline">
                <div className="flex h-2 overflow-hidden rounded-full">
                  {PRICE_SCALE.map((color) => (
                    <span key={color} className="flex-1" style={{ background: color }} />
                  ))}
                </div>
                <div className="muted mt-1.5 grid grid-cols-5 text-center text-[10px] font-semibold">
                  {PRICE_LEVELS.map((level) => (
                    <span key={level.step}>{level.label}</span>
                  ))}
                </div>
                <p className="muted mt-1 text-center text-[10px]">
                  Je größer der Punkt, desto weiter liegt der Ort vom Median entfernt.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {selected && (
                <div className="card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider muted">
                    {selected.plz} · {selected.state}
                  </p>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-lg font-bold">{selected.city}</p>
                    {selectedStep !== null && <PriceBadge step={selectedStep} />}
                  </div>
                  <p className="muted mb-3 text-sm">
                    {selected.provider || "Grundversorger unbekannt"}
                  </p>

                  <dl className="space-y-1.5 text-sm">
                    <Row
                      label="Arbeitspreis"
                      value={
                        (energy === "strom" ? selected.stromCt : selected.gasCt) !== null
                          ? `${(energy === "strom" ? selected.stromCt : selected.gasCt)!
                              .toLocaleString("de-DE", { minimumFractionDigits: 2 })} ct/kWh`
                          : "–"
                      }
                    />
                    <Row label="Jahreskosten Musterhaushalt" value={euro(selectedValue)} />
                    <Row
                      label="ggü. Bundesmedian"
                      value={
                        delta === null
                          ? "–"
                          : `${delta > 0 ? "+" : ""}${euro(delta)} pro Jahr`
                      }
                      tone={delta !== null && delta > 0 ? "danger" : "success"}
                    />
                  </dl>

                  {delta !== null && delta > 0 && (
                    <p
                      className="mt-3 rounded-xl px-3 py-2 text-xs font-medium"
                      style={{
                        background: "color-mix(in srgb, var(--energy-500) 12%, transparent)",
                        color: "var(--energy-700)",
                      }}
                    >
                      Guter Ort zum Klingeln: Der Grundversorger liegt {euro(delta)} pro Jahr
                      über dem Median.
                    </p>
                  )}
                </div>
              )}

              <div className="card p-4">
                <p className="mb-2 text-sm font-semibold">
                  Teuerste Grundversorger {energy === "strom" ? "(Strom)" : "(Gas)"}
                </p>
                <ol className="space-y-1">
                  {stats.ranked.slice(0, 12).map((point, index) => (
                    <li key={point.plz}>
                      <button
                        onClick={() => focus(point)}
                        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-brand-500/8"
                      >
                        <span className="muted w-4 text-xs tabular-nums">{index + 1}</span>
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: colorFor(point) }}
                        />
                        <span className="min-w-0 flex-1 truncate">{point.city}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums">
                          {euro(valueOf(point, energy))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="card p-4 text-xs">
                <p className="font-semibold">Datenstand</p>
                {refresh?.finished_at ? (
                  <p className="muted mt-1">
                    {new Date(refresh.finished_at).toLocaleString("de-DE")} ·{" "}
                    {refresh.source || "unbekannte Quelle"} · {refresh.row_count} PLZ
                    {refresh.status !== "ok" && (
                      <span className="block font-semibold text-signal-600">
                        Letzter Abruf fehlgeschlagen: {refresh.message}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="muted mt-1">Noch kein Abruf protokolliert.</p>
                )}
                {message && (
                  <p className="mt-2 font-semibold text-brand-600">{message}</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  const color =
    tone === "danger" ? "var(--signal-600)" : tone === "success" ? "var(--energy-600)" : undefined;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="muted">{label}</dt>
      <dd className="font-semibold tabular-nums" style={{ color }}>
        {value}
      </dd>
    </div>
  );
}
