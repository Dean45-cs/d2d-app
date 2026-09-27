"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  EmptyState,
  Note,
  PageHeader,
  SectionHeader,
  Segmented,
  StatTile,
  euro,
} from "@/components/ui";
import { IconBolt, IconInfo, IconRefresh } from "@/components/icons";
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

  const isDemo = points.some((p) => p.isDemo);
  const ownCount = points.filter((p) => !p.isDemo).length;

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
          ? `Preise aktualisiert – ${data.rowCount} Orte.`
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

  const stand = refresh?.finished_at
    ? `Stand ${new Date(refresh.finished_at).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })}`
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Energiekarte"
        subtitle={[
          points.length > 0 && `${points.length} Orte`,
          `Musterhaushalt ${
            energy === "strom"
              ? `${consumption.strom.toLocaleString("de-DE")} kWh Strom`
              : `${consumption.gas.toLocaleString("de-DE")} kWh Gas`
          }`,
          stand,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <>
            {points.length > 0 && (
              <Segmented<Energy>
                ariaLabel="Energieart"
                value={energy}
                onChange={setEnergy}
                options={[
                  { value: "strom", label: "Strom" },
                  { value: "gas", label: "Gas" },
                ]}
              />
            )}
            {isLeader && (
              <button
                className="icon-btn icon-btn-outline h-10 w-10"
                onClick={refreshNow}
                disabled={busy}
                aria-label="Preise jetzt aktualisieren"
                title="Preise jetzt aktualisieren"
              >
                <IconRefresh className={`h-[18px] w-[18px] ${busy ? "animate-spin" : ""}`} />
              </button>
            )}
          </>
        }
      />

      {message && (
        <div className="mb-4">
          <Note tone="brand" icon={<IconInfo className="h-4 w-4" />}>
            {message}
          </Note>
        </div>
      )}
      {refresh && refresh.status !== "ok" && (
        <div className="mb-4">
          <Note tone="danger" icon={<IconInfo className="h-4 w-4" />}>
            Letzter Abruf fehlgeschlagen: {refresh.message}
          </Note>
        </div>
      )}

      {points.length === 0 ? (
        <EmptyState
          icon={<IconBolt className="h-7 w-7" />}
          title="Noch keine Preisdaten"
          text={
            isLeader
              ? "Über den Knopf oben rechts lädt die App die Preise der Grundversorger."
              : "Sobald die Teamleitung Preise geladen hat, erscheinen sie hier."
          }
        />
      ) : (
        <>
          {isDemo && (
            <div className="mb-4">
              <Note tone="warn" icon={<IconInfo className="h-4 w-4" />}>
                {ownCount > 0
                  ? `Echt sind nur die ${ownCount} Orte mit eingetragenem Preisblatt – alle übrigen Preise sind Beispielwerte.`
                  : "Die Preise sind Beispielwerte, keine echten Grundversorgertarife."}{" "}
                {isLeader && (
                  <Link href="/einstellungen#grundversorger" className="font-semibold underline">
                    Echte Preise eintragen
                  </Link>
                )}
              </Note>
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
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

          <div className="grid items-start gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="card overflow-hidden">
              <MapView
                className="h-[62vh] min-h-[380px] w-full"
                onEngine={setEngine}
                onFit={() => engine?.fit(GERMANY_POINTS, { padding: 8, animate: true })}
              />
              <div className="border-t px-4 pb-3 pt-3 hairline">
                <div className="flex h-2 overflow-hidden rounded-full">
                  {PRICE_SCALE.map((color) => (
                    <span key={color} className="flex-1" style={{ background: color }} />
                  ))}
                </div>
                <div className="muted mt-1.5 grid grid-cols-5 text-center text-[11px] font-medium">
                  {PRICE_LEVELS.map((level) => (
                    <span key={level.step}>{level.label}</span>
                  ))}
                </div>
                <p className="muted mt-1 text-center text-[11px]">
                  Größere Punkte liegen weiter vom Median entfernt.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {selected && (
                <div className="card p-5">
                  <p className="muted text-[12.5px] font-medium">
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
                    <div className="mt-3">
                      <Note tone="success">
                        Guter Ort zum Klingeln: Der Grundversorger liegt {euro(delta)} pro Jahr
                        über dem Median.
                      </Note>
                    </div>
                  )}
                </div>
              )}

              <div className="card p-5">
                <SectionHeader
                  title={`Teuerste Orte · ${energy === "strom" ? "Strom" : "Gas"}`}
                  className="mb-2"
                />
                <ol className="-mx-2 space-y-0.5">
                  {stats.ranked.slice(0, 12).map((point, index) => (
                    <li key={point.plz}>
                      <button
                        onClick={() => focus(point)}
                        className="flex w-full items-center gap-2.5 rounded-[var(--r-xs)] px-2 py-1.5 text-left text-[13.5px] transition-colors hover:bg-[var(--hover)]"
                        aria-current={selected?.plz === point.plz ? "true" : undefined}
                      >
                        <span className="muted w-5 text-right text-[12px] tabular-nums">{index + 1}</span>
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
    tone === "danger" ? "var(--danger-ink)" : tone === "success" ? "var(--ok-ink)" : undefined;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="muted">{label}</dt>
      <dd className="font-semibold tabular-nums" style={{ color }}>
        {value}
      </dd>
    </div>
  );
}
