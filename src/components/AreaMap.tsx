"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo/area";
import { labelPoint, resolveOverlaps, shapePoints, type Shape } from "@/lib/geo/shape";
import { MapView } from "./map/MapView";
import { declutter, type Placeable } from "./map/declutter";
import { badgeMarker } from "./map/markers";
import type { MapEngine } from "./map/types";
import { cssColor, progressColor } from "./map-colors";

export type AreaTone = "brand" | "success" | "warn" | "muted";
export type PinState = "open" | "active" | "done";

export interface MapArea {
  id: number;
  name: string;
  area: Shape;
  tone?: AreaTone;
  hint?: string;
  /** Zahl oder Kuerzel, das dauerhaft auf der Flaeche steht. */
  badge?: string;
}

export interface MapPin {
  lat: number;
  lng: number;
  label: string;
  hint?: string;
  state?: PinState;
}

export interface LegendEntry {
  color: string;
  label: string;
}

interface Props {
  areas: MapArea[];
  pins?: MapPin[];
  legend?: LegendEntry[];
  /** Hoehe der Karte als Tailwind-Klasse. */
  className?: string;
  onSelect?: (id: number) => void;
}

/**
 * Je Ton zwei Farben: die Linie nimmt die helle Stufe (auf dunkler Karte
 * sonst kaum zu sehen), das Schild die satte - darauf bleibt weisse Schrift lesbar.
 */
const TONE_VARS: Record<AreaTone, { line: [string, string]; badge: [string, string] }> = {
  brand: { line: ["--tint", "#0f5cab"], badge: ["--brand-600", "#0f5cab"] },
  success: { line: ["--ok-ink", "#059450"], badge: ["--energy-600", "#059450"] },
  warn: { line: ["--warn-ink", "#d97706"], badge: ["--gas-500", "#f59e0b"] },
  muted: { line: ["--ink-muted", "#66788f"], badge: ["--ink-muted", "#66788f"] },
};

/** Legende passend zu den Linien - CSS-Variablen stimmen schon beim ersten Zeichnen. */
export const TONE_LEGEND: Record<AreaTone, string> = {
  brand: "var(--tint)",
  success: "var(--ok-ink)",
  warn: "var(--warn-ink)",
  muted: "var(--ink-muted)",
};

const BADGE_SIZE = 28;

/**
 * Zeigt gezeichnete Gebiete und ihre Strassen auf einer Karte.
 *
 * Ueberschneiden sich Gebiete (aeltere Daten), gehoert jeder Fleck Boden auf
 * der Karte trotzdem genau einem: das kleinere Gebiet liegt obenauf, das
 * groessere bekommt dort ein Loch. So entstehen keine trueben Mischfarben, und
 * jedes Schild steht mitten in seiner eigenen Flaeche.
 */
export function AreaMap({ areas, pins = [], legend, className, onSelect }: Props) {
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const pieces = useMemo(() => resolveOverlaps(areas.map((item) => item.area)), [areas]);

  const allPoints = useMemo<LatLng[]>(
    () => [
      ...areas.flatMap((item) => shapePoints(item.area)),
      ...pins.map((pin) => [pin.lat, pin.lng] as LatLng),
    ],
    [areas, pins],
  );

  const fitAll = useCallback(
    (animate: boolean) => engine?.fit(allPoints, { padding: 28, maxZoom: 17, animate }),
    [engine, allPoints],
  );

  useEffect(() => {
    if (!engine) return;
    const layer = engine.layer();
    const clickable = Boolean(selectRef.current);
    const badges: Placeable[] = [];

    areas.forEach((item, index) => {
      const tone = TONE_VARS[item.tone ?? "brand"];
      const line = cssColor(...tone.line);
      const open = clickable ? () => selectRef.current?.(item.id) : undefined;
      const piece = pieces[index];
      // Ganz von kleineren Gebieten bedeckt: nur der Umriss, gestrichelt.
      const covered = piece.length === 0;
      const visible = covered ? item.area : piece;

      for (const polygon of visible) {
        layer.polygon(polygon, {
          color: line,
          weight: covered ? 1.5 : 2,
          fillOpacity: covered ? 0 : 0.16,
          dashed: covered,
          inset: !covered,
          title: item.name,
          subtitle: item.hint,
          onClick: open,
        });
      }

      const label = item.badge ? labelPoint(visible) : null;
      if (item.badge && label) {
        const handle = layer.marker(label.point, {
          ...badgeMarker(cssColor(...tone.badge), item.badge, BADGE_SIZE),
          title: item.name,
          subtitle: item.hint,
          onClick: open,
          priority: 2,
        });
        // Wer mehr Platz hat, behaelt sein Schild, wenn zwei sich decken.
        badges.push({ point: label.point, size: [BADGE_SIZE, BADGE_SIZE], rank: label.room, handle });
      }
    });

    for (const pin of pins) {
      layer.dot([pin.lat, pin.lng], {
        color: progressColor(pin.state ?? "open"),
        radius: 6,
        ring: true,
        title: pin.label,
        subtitle: pin.hint,
      });
    }

    fitAll(false);
    const stopWatching = declutter(engine, badges);
    return () => {
      stopWatching();
      layer.clear();
    };
    // fitAll haengt an denselben Daten; nur bei neuen Daten neu zeichnen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, areas, pieces, pins]);

  return (
    <div className="overflow-hidden rounded-xl border hairline">
      <MapView
        className={className ?? "h-[45vh] min-h-[260px] w-full"}
        onEngine={setEngine}
        onFit={allPoints.length > 0 ? () => fitAll(true) : undefined}
      />
      {legend && legend.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 hairline">
          {legend.map((entry) => (
            <li key={entry.label} className="muted flex items-center gap-1.5 text-xs">
              <span
                className="h-2.5 w-2.5 rounded-full ring-2 ring-white/80"
                style={{ background: entry.color }}
                aria-hidden
              />
              {entry.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
