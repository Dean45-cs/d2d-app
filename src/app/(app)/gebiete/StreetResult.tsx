"use client";

import type { User } from "@/lib/types";
import { plural } from "@/components/ui";
import { MAX_PLOTS } from "@/lib/geo/split";

export interface FoundStreet {
  name: string;
  houseNumbers: string;
  units: number;
  addresses: number;
  lat: number | null;
  lng: number | null;
  points: [number, number][];
}

export interface Plot {
  /** Anzeigenummer, beginnt bei 1. */
  label: string;
  color: string;
  streets: FoundStreet[];
  doors: number;
}

interface Props {
  streets: FoundStreet[];
  addressCount: number;
  chosen: Set<string>;
  onToggle: (name: string) => void;
  onChooseAll: (all: boolean) => void;
  focus: string | null;
  onFocus: (name: string) => void;
  plotCount: number;
  onPlotCount: (count: number) => void;
  plots: Plot[];
  plotOf: Map<string, number>;
  members: User[];
  assignees: string[];
  onAssignee: (index: number, value: string) => void;
}

/**
 * Was in der gezeichneten Flaeche gefunden wurde: Strassen zum Abwaehlen und
 * die Aufteilung auf mehrere Leute. Ein Tipp auf eine Zeile zeigt die Strasse
 * auf der Karte.
 */
export function StreetResult({
  streets,
  addressCount,
  chosen,
  onToggle,
  onChooseAll,
  focus,
  onFocus,
  plotCount,
  onPlotCount,
  plots,
  plotOf,
  members,
  assignees,
  onAssignee,
}: Props) {
  const selected = streets.filter((s) => chosen.has(s.name));
  const doors = selected.reduce((sum, s) => sum + doorsOf(s), 0);
  const splitting = plotCount > 1;

  if (streets.length === 0) {
    return (
      <div className="rounded-xl border px-3 py-4 hairline">
        <p className="muted text-sm">
          In dieser Fläche sind keine Straßen hinterlegt. Zeichne etwas größer oder trage
          die Straßen über „Liste einfügen“ von Hand ein.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border hairline">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 hairline">
        <p className="text-sm font-semibold">
          {plural(streets.length, "Straße", "Straßen")} ·{" "}
          {plural(addressCount, "Adresse", "Adressen")}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="muted text-xs font-semibold underline"
            onClick={() => onChooseAll(true)}
          >
            alle
          </button>
          <button
            type="button"
            className="muted text-xs font-semibold underline"
            onClick={() => onChooseAll(false)}
          >
            keine
          </button>
        </div>
      </div>

      {/* ------------------------------ Aufteilen ----------------------------- */}
      <div className="border-b px-3 py-2.5 hairline">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mb-0">Aufteilen auf</span>
          <div className="flex overflow-hidden rounded-xl border hairline">
            {Array.from({ length: MAX_PLOTS }, (_, i) => i + 1).map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => onPlotCount(count)}
                aria-pressed={plotCount === count}
                className={`w-10 py-1.5 text-sm font-semibold tabular-nums ${
                  plotCount === count ? "bg-brand-600 text-white" : ""
                }`}
              >
                {count}
              </button>
            ))}
          </div>
          <span className="muted text-xs">
            {splitting
              ? `${plots.length || plotCount} Gebiete, nach Türen ausgewogen`
              : "ein Gebiet für eine Person"}
          </span>
        </div>

        {splitting && (
          <ul className="mt-2.5 space-y-2">
            {plots.map((plot, index) => (
              <li key={plot.label} className="flex flex-wrap items-center gap-2">
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                  style={{ background: plot.color }}
                  aria-hidden
                >
                  {plot.label}
                </span>
                <span className="muted min-w-[9rem] flex-1 text-xs tabular-nums">
                  {plural(plot.streets.length, "Straße", "Straßen")} ·{" "}
                  {plural(plot.doors, "Tür", "Türen")}
                </span>
                <select
                  className="select w-full min-w-[10rem] px-2 py-1 text-sm sm:w-auto sm:flex-1"
                  value={assignees[index] ?? ""}
                  onChange={(e) => onAssignee(index, e.target.value)}
                  aria-label={`Teilgebiet ${plot.label} zuteilen an`}
                >
                  <option value="">– später zuteilen –</option>
                  {members
                    .filter((m) => m.active)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ----------------------------- Straßenliste ---------------------------- */}
      <ul className="max-h-64 divide-y overflow-y-auto hairline">
        {streets.map((street) => {
          const isChosen = chosen.has(street.name);
          const plotIndex = plotOf.get(street.name);
          const plot = plotIndex !== undefined ? plots[plotIndex] : undefined;
          return (
            <li
              key={street.name}
              className={focus === street.name ? "bg-brand-500/8" : undefined}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  type="checkbox"
                  id={`street-${street.name}`}
                  className="h-5 w-5 shrink-0 accent-[var(--brand-600)]"
                  checked={isChosen}
                  onChange={() => onToggle(street.name)}
                  aria-label={`${street.name} ins Gebiet übernehmen`}
                />

                {splitting && isChosen && plot && (
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: plot.color }}
                    title={`Teilgebiet ${plot.label}`}
                  >
                    {plot.label}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onFocus(street.name)}
                  className="min-w-0 flex-1 text-left"
                  title="Auf der Karte zeigen"
                >
                  <span className={`block truncate text-sm ${isChosen ? "font-medium" : "muted"}`}>
                    {street.name}
                  </span>
                  <span className="muted block text-xs">
                    {street.houseNumbers ? `Nr. ${street.houseNumbers}` : "keine Hausnummern"}
                    {street.units > 0 && ` · ${street.units} WE`}
                    {street.units === 0 && street.addresses > 0 && ` · ${street.addresses} Adressen`}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="muted border-t px-3 py-2 text-xs hairline">
        Ausgewählt: {plural(selected.length, "Straße", "Straßen")} mit{" "}
        {plural(doors, "Tür", "Türen")}. Die Zahlen stammen aus OpenStreetMap und lassen
        sich später anpassen.
      </p>
    </div>
  );
}

/** Aufwand einer Strasse: Wohneinheiten, sonst Adressen. */
export function doorsOf(street: FoundStreet): number {
  return street.units > 0 ? street.units : street.addresses;
}
