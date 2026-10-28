"use client";

import type { User } from "@/lib/types";
import { EmptyState, ListLabel, Segmented, SkeletonLine, SkeletonList, plural } from "@/components/ui";
import { IconCheck, IconPin } from "@/components/icons";
import type { Shape } from "@/lib/geo/shape";
import { MAX_PLOTS, PLOT_SIZES } from "@/lib/geo/split";

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
  /** Strassen des Teilgebiets - geteilte Strassen nur mit ihren Haeusern hier. */
  streets: FoundStreet[];
  doors: number;
  /** Teilflaeche, in der genau diese Haeuser liegen. */
  area: Shape;
  /** Anteil an allen Tueren in Prozent. */
  share: number;
  /** Gewuenschte Groesse im Vergleich zu den anderen (1 = normal). */
  size: number;
  /** Platz in der Liste der Groessen - bleibt gleich, auch wenn ein leeres Paket wegfaellt. */
  slot: number;
}

/** "1,5×" - Groessen ohne Nachkommastellen-Ballast. */
function sizeLabel(size: number): string {
  if (size === 1) return "Normal";
  return `${size.toLocaleString("de-DE")}×`;
}

interface Props {
  streets: FoundStreet[];
  addressCount: number;
  /** "tiles": aus den Kartenkacheln, Hausnummern der naechsten Strasse zugeordnet. */
  source?: "overpass" | "tiles";
  chosen: Set<string>;
  onToggle: (name: string) => void;
  onChooseAll: (all: boolean) => void;
  focus: string | null;
  onFocus: (name: string) => void;
  plotCount: number;
  onPlotCount: (count: number) => void;
  /** Groesse eines Teilgebiets aendern (slot aus Plot). */
  onPlotSize: (slot: number, size: number) => void;
  plots: Plot[];
  /** Strassenname -> Teilgebiete; eine Strasse ueber eine Grenze steht in mehreren. */
  plotOf: Map<string, number[]>;
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
  source,
  chosen,
  onToggle,
  onChooseAll,
  focus,
  onFocus,
  plotCount,
  onPlotCount,
  onPlotSize,
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
    return <EmptyState title="Keine Straßen in dieser Fläche" text="Größer zeichnen oder als Liste einfügen." />;
  }

  return (
    <div className="space-y-6">
      {/* --------------------------- Was gefunden wurde --------------------- */}
      <div className="flex items-end justify-between gap-4 px-1">
        <div className="min-w-0">
          <p className="kpi text-title-2">
            {plural(selected.length, "Straße", "Straßen")} · {plural(doors, "Tür", "Türen")}
          </p>
          <p className="text-footnote text-muted">
            {streets.length} gefunden · {addressCount} Adressen aus OpenStreetMap
          </p>
          {source === "tiles" && (
            <p className="text-footnote text-muted">
              Aus den Kartendaten – Hausnummern sind der nächsten Straße zugeordnet.
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="chip min-h-8" onClick={() => onChooseAll(true)}>
            Alle
          </button>
          <button type="button" className="chip min-h-8" onClick={() => onChooseAll(false)}>
            Keine
          </button>
        </div>
      </div>

      {/* ------------------------------ Aufteilen ---------------------------- */}
      <div>
        <ListLabel>In wie viele Teile aufteilen?</ListLabel>
        {/* Bis zu sechs Teile: auf dem Handy passen nur Ziffern nebeneinander - 1 heisst ganz. */}
        <Segmented
          options={Array.from({ length: MAX_PLOTS }, (_, i) => ({
            value: String(i + 1),
            label: String(i + 1),
          }))}
          value={String(plotCount)}
          onChange={(value) => onPlotCount(Number(value))}
          ariaLabel="Gebiet aufteilen in wie viele Teile"
        />
        {splitting && plots.length > 0 && (
          <ul className="list list-icons mt-4">
            {plots.map((plot, index) => (
              <li key={plot.label} className="cell flex-wrap gap-y-2">
                <span
                  className="kpi grid h-8 w-8 shrink-0 place-items-center rounded-full text-subhead text-white"
                  style={{ background: plot.color }}
                  aria-hidden="true"
                >
                  {plot.label}
                </span>
                <span className="min-w-0 flex-1 text-footnote text-muted">
                  <span className="block text-subhead font-semibold text-ink">
                    {plural(plot.doors, "Tür", "Türen")} · {plot.share} %
                  </span>
                  {plural(plot.streets.length, "Straße", "Straßen")}
                </span>
                {/* Mehr fuer den Erfahrenen, weniger fuer den Neuen - z. B. 1,5× und Normal ergibt 60/40. */}
                <select
                  className="field w-28 shrink-0 py-2"
                  value={String(plot.size)}
                  onChange={(e) => onPlotSize(plot.slot, Number(e.target.value))}
                  aria-label={`Größe von Teilgebiet ${plot.label}`}
                >
                  {PLOT_SIZES.map((size) => (
                    <option key={size} value={String(size)}>
                      {sizeLabel(size)}
                    </option>
                  ))}
                </select>
                {members.length > 0 && (
                  <select
                    className="field w-full shrink-0 py-2 sm:w-40"
                    value={assignees[index] ?? ""}
                    onChange={(e) => onAssignee(index, e.target.value)}
                    aria-label={`Teilgebiet ${plot.label} zuteilen an`}
                  >
                    <option value="">Später zuteilen</option>
                    {members
                      .filter((m) => m.active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ----------------------------- Straßenliste -------------------------- */}
      <div>
        <ListLabel>Straßen</ListLabel>
        <ul className="list max-h-80 overflow-y-auto">
          {streets.map((street) => {
            const isChosen = chosen.has(street.name);
            const inPlots = (plotOf.get(street.name) ?? []).map((index) => plots[index]).filter(Boolean);
            return (
              <li key={street.name} className={`cell gap-2 py-1 pr-4 ${focus === street.name ? "bg-accent-tint" : ""}`}>
                <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isChosen}
                    onChange={() => onToggle(street.name)}
                    aria-label={`${street.name} ins Gebiet übernehmen`}
                  />
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full ${
                      isChosen ? "text-accent-ink ring-2 ring-accent" : "ring-2 ring-fill-strong"
                    }`}
                    aria-hidden="true"
                  >
                    {isChosen && <IconCheck className="h-3.5 w-3.5" />}
                  </span>
                </label>
                {splitting && isChosen && inPlots.length > 0 && (
                  // Laeuft die Strasse ueber eine Grenze, steht jedes Teilgebiet da, das Haeuser von ihr hat.
                  <span className="flex shrink-0 gap-0.5">
                    {inPlots.map((plot) => (
                      <span
                        key={plot.label}
                        className={`kpi grid place-items-center rounded-full text-white ${
                          inPlots.length > 1 ? "h-5 w-5 text-caption-2" : "h-6 w-6 text-caption"
                        }`}
                        style={{ background: plot.color }}
                        title={`Teilgebiet ${plot.label}`}
                      >
                        {plot.label}
                      </span>
                    ))}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onFocus(street.name)}
                  className="min-w-0 flex-1 py-2 text-left"
                  aria-label={`${street.name} auf der Karte zeigen`}
                >
                  <span className={`block truncate text-body ${isChosen ? "" : "text-muted"}`}>{street.name}</span>
                  {splitting && isChosen && inPlots.length > 1 ? (
                    // Geteilte Strasse: welche Nummern in welches Teilgebiet gehen - umbrechen statt abschneiden.
                    <span className="block text-footnote text-muted">
                      {inPlots
                        .map((plot) => `${plot.label}: Nr. ${plot.streets.find((s) => s.name === street.name)?.houseNumbers || "–"}`)
                        .join(" · ")}
                    </span>
                  ) : (
                    <span className="block truncate text-footnote text-muted">
                      {street.numbers.length > 0 ? `Nr. ${preview(street)}` : "ohne Hausnummern"}
                      {street.units > street.numbers.length ? ` · ${plural(street.units, "WE", "WE")}` : ""}
                    </span>
                  )}
                </button>
                <IconPin className="h-4 w-4 shrink-0 text-muted" />
              </li>
            );
          })}
        </ul>
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

/** Platzhalter, solange OpenStreetMap antwortet - der Schritt bleibt nie leer. */
export function StreetResultSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Straßen werden gesucht">
      <div className="space-y-2 px-1">
        <SkeletonLine width="60%" height={20} className="rounded-md" />
        <SkeletonLine width="40%" height={10} />
      </div>
      <SkeletonLine height={44} />
      <SkeletonList rows={5} icon={false} />
    </div>
  );
}
