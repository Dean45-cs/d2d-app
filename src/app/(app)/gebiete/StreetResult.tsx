"use client";

import type { User } from "@/lib/types";
import { GroupLabel, Note, Segmented, plural } from "@/components/ui";
import { IconCheck, IconInfo, IconList, IconPin, IconSplit } from "@/components/icons";
import { MAX_PLOTS } from "@/lib/geo/split";

export interface FoundAddress {
  number: string;
  units: number;
  lat: number | null;
  lng: number | null;
}

export interface FoundStreet {
  name: string;
  houseNumbers: string;
  units: number;
  addresses: number;
  lat: number | null;
  lng: number | null;
  /** Jede gefundene Hausnummer einzeln. */
  numbers: FoundAddress[];
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
      <Note icon={<IconInfo className="h-4 w-4" />}>
        In dieser Fläche sind keine Straßen hinterlegt. Zeichne etwas größer oder trage die
        Straßen über „Liste einfügen“ von Hand ein.
      </Note>
    );
  }

  return (
    <div className="space-y-3">
      {/* --------------------------- Was gefunden wurde --------------------- */}
      <div className="inset flex items-center gap-3 px-3.5 py-3">
        <span
          className="tile-icon h-10 w-10 shrink-0"
          style={{
            background: "color-mix(in srgb, var(--brand-500) 13%, transparent)",
            color: "var(--brand-600)",
          }}
          aria-hidden
        >
          <IconList className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tabular-nums">
            {plural(selected.length, "Straße", "Straßen")} · {plural(doors, "Tür", "Türen")}
          </p>
          <p className="muted text-[12px] tabular-nums">
            {streets.length} gefunden, {addressCount} Adressen aus OpenStreetMap
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-pill"
            onClick={() => onChooseAll(true)}
          >
            alle
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-pill"
            onClick={() => onChooseAll(false)}
          >
            keine
          </button>
        </div>
      </div>

      {/* ------------------------------ Aufteilen ---------------------------- */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <IconSplit className="muted h-4 w-4" />
          <GroupLabel>Auf wie viele Leute aufteilen?</GroupLabel>
        </div>
        <Segmented
          options={Array.from({ length: MAX_PLOTS }, (_, i) => ({
            value: String(i + 1),
            label: i === 0 ? "1 Person" : `${i + 1} Pakete`,
          }))}
          value={String(plotCount)}
          onChange={(value) => onPlotCount(Number(value))}
          tone="brand"
          ariaLabel="Gebiet aufteilen"
        />
        <p className="muted mt-1.5 px-0.5 text-[11px]">
          {splitting
            ? `${plots.length || plotCount} Pakete, nach Türen ausgewogen – jedes bekommt eine eigene Farbe auf der Karte.`
            : "Ein Gebiet für eine Person."}
        </p>

        {splitting && plots.length > 0 && (
          <ul className="list mt-2.5">
            {plots.map((plot, index) => (
              <li key={plot.label} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white"
                  style={{ background: plot.color }}
                  aria-hidden
                >
                  {plot.label}
                </span>
                <span className="muted min-w-[8rem] flex-1 text-[12px] tabular-nums">
                  {plural(plot.streets.length, "Straße", "Straßen")}
                  <span className="block font-semibold text-[var(--ink)]">
                    {plural(plot.doors, "Tür", "Türen")}
                  </span>
                </span>
                <select
                  className="select w-full min-w-[9rem] px-2.5 py-1.5 text-[13px] sm:w-auto sm:flex-1"
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

      {/* ----------------------------- Straßenliste -------------------------- */}
      <div>
        <GroupLabel>Straßen im Gebiet</GroupLabel>
        <ul className="list max-h-72 overflow-y-auto">
          {streets.map((street) => {
            const isChosen = chosen.has(street.name);
            const plotIndex = plotOf.get(street.name);
            const plot = plotIndex !== undefined ? plots[plotIndex] : undefined;
            return (
              <li
                key={street.name}
                className="flex items-center gap-2.5 px-3 py-2"
                style={
                  focus === street.name
                    ? { background: "color-mix(in srgb, var(--brand-500) 9%, transparent)" }
                    : undefined
                }
              >
                <label className="shrink-0 cursor-pointer p-1">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isChosen}
                    onChange={() => onToggle(street.name)}
                    aria-label={`${street.name} ins Gebiet übernehmen`}
                  />
                  <span
                    className="grid h-6 w-6 place-items-center rounded-full border transition"
                    style={
                      isChosen
                        ? {
                            background: "var(--brand-600)",
                            borderColor: "transparent",
                            color: "#fff",
                          }
                        : { borderColor: "var(--line-strong)" }
                    }
                    aria-hidden
                  >
                    {isChosen && <IconCheck className="h-3.5 w-3.5" />}
                  </span>
                </label>

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
                  className="min-w-0 flex-1 py-1 text-left"
                  title="Auf der Karte zeigen"
                >
                  <span
                    className={`block truncate text-[14px] ${
                      isChosen ? "font-semibold" : "muted"
                    }`}
                  >
                    {street.name}
                  </span>
                  <span className="muted block truncate text-[11px]">
                    {street.numbers.length > 0
                      ? `${plural(street.numbers.length, "Hausnummer", "Hausnummern")}: ${preview(street)}`
                      : "keine Hausnummern hinterlegt"}
                    {street.units > street.numbers.length
                      ? ` · ${plural(street.units, "Wohneinheit", "Wohneinheiten")}`
                      : ""}
                  </span>
                </button>

                <span className="muted shrink-0 pr-1" aria-hidden>
                  <IconPin className="h-4 w-4" />
                </span>
              </li>
            );
          })}
        </ul>
        <p className="muted mt-1.5 px-0.5 text-[11px] leading-snug">
          Die Zahlen stammen aus OpenStreetMap und lassen sich später anpassen. Ein Tipp auf
          eine Zeile zeigt die Straße auf der Karte.
        </p>
      </div>
    </div>
  );
}

/** Aufwand einer Strasse: Wohneinheiten, sonst Zahl der Haeuser. */
export function doorsOf(street: FoundStreet): number {
  return street.units > 0 ? street.units : street.numbers.length || street.addresses;
}

/** Koordinaten der Haeuser - fuer Karte und Umriss. */
export function pointsOf(street: FoundStreet): [number, number][] {
  return street.numbers.flatMap((house) =>
    house.lat !== null && house.lng !== null ? [[house.lat, house.lng] as [number, number]] : [],
  );
}

/** Die ersten Nummern als Kostprobe: "1, 3, 5, 7 …" */
function preview(street: FoundStreet): string {
  const first = street.numbers.slice(0, 6).map((h) => h.number).join(", ");
  return street.numbers.length > 6 ? `${first} …` : first;
}
