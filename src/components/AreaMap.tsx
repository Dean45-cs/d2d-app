"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LatLng } from "@/lib/geo/area";
import { labelPoint, resolveOverlaps, shapePoints, type Shape } from "@/lib/geo/shape";
import { MapView } from "./map/MapView";
import { declutter, type Placeable } from "./map/declutter";
import { badgeMarker } from "./map/markers";
import type { MapEngine } from "./map/types";
import { cssColor } from "./map-colors";

/** Stand eines Gebiets auf der Karte - in Arbeit gruen, sonst neutral. */
export type AreaTone = "active" | "done" | "paused" | "open";

export interface MapArea {
  id: number;
  name: string;
  area: Shape;
  tone?: AreaTone;
  hint?: string;
  /** Kuerzel, das dauerhaft auf der Flaeche steht (wer dran ist). */
  badge?: string;
}

export interface LegendEntry {
  tone: AreaTone;
  label: string;
}

interface Props {
  areas: MapArea[];
  legend?: LegendEntry[];
  /** Hoehe der Karte als Tailwind-Klasse. */
  className?: string;
  onSelect?: (id: number) => void;
  /** Bedienelemente oben links ueber der Karte (Filter). */
  children?: ReactNode;
}

const TONE_VARS: Record<AreaTone, [string, string]> = {
  active: ["--accent", "#1f9d4c"],
  done: ["--ink-2", "#3c3c43"],
  paused: ["--muted", "#68686f"],
  open: ["--muted", "#68686f"],
};

/** Legende passend zu den Linien. */
export const TONE_LEGEND: Record<AreaTone, string> = {
  active: "var(--accent)",
  done: "var(--ink-2)",
  paused: "var(--muted)",
  open: "var(--muted)",
};

const BADGE_SIZE = 28;

/**
 * Gezeichnete Gebiete auf einer Karte. Ueberschneiden sich Gebiete (aeltere
 * Daten), gehoert jeder Fleck genau einem: das kleinere liegt obenauf, das
 * groessere bekommt ein Loch - keine trueben Mischfarben.
 */
export function AreaMap({ areas, legend, className, onSelect, children }: Props) {
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const pieces = useMemo(() => resolveOverlaps(areas.map((item) => item.area)), [areas]);
  const allPoints = useMemo<LatLng[]>(() => areas.flatMap((item) => shapePoints(item.area)), [areas]);

  const fitAll = useCallback(
    (animate: boolean) => engine?.fit(allPoints, { padding: 32, maxZoom: 17, animate }),
    [engine, allPoints],
  );

  useEffect(() => {
    if (!engine) return;
    const layer = engine.layer();
    const clickable = Boolean(selectRef.current);
    const badges: Placeable[] = [];

    areas.forEach((item, index) => {
      const tone = item.tone ?? "active";
      const color = cssColor(...TONE_VARS[tone]);
      const open = clickable ? () => selectRef.current?.(item.id) : undefined;
      const piece = pieces[index];
      // Ganz von kleineren Gebieten bedeckt: nur der Umriss, gestrichelt.
      const covered = piece.length === 0;
      const visible = covered ? item.area : piece;
      for (const polygon of visible) {
        layer.polygon(polygon, {
          color,
          weight: covered ? 1.5 : 2,
          fillOpacity: covered ? 0 : tone === "active" ? 0.16 : 0.08,
          dashed: covered || tone === "paused",
          inset: !covered,
          title: item.name,
          subtitle: item.hint,
          onClick: open,
        });
      }
      const label = item.badge ? labelPoint(visible) : null;
      if (item.badge && label) {
        const handle = layer.marker(label.point, {
          ...badgeMarker(color, item.badge, BADGE_SIZE),
          title: item.name,
          subtitle: item.hint,
          onClick: open,
          priority: 2,
        });
        badges.push({ point: label.point, size: [BADGE_SIZE, BADGE_SIZE], rank: label.room, handle });
      }
    });

    fitAll(false);
    const stopWatching = declutter(engine, badges);
    return () => {
      stopWatching();
      layer.clear();
    };
    // fitAll haengt an denselben Daten; nur bei neuen Daten neu zeichnen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, areas, pieces]);

  return (
    <div className="relative overflow-hidden rounded-xl">
      <MapView
        className={className ?? "h-[45vh] min-h-64 w-full"}
        onEngine={setEngine}
        onFit={allPoints.length > 0 ? () => fitAll(true) : undefined}
      >
        {children && (
          <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] flex flex-wrap gap-2">{children}</div>
        )}
        {legend && legend.length > 0 && (
          <ul className="map-chip pointer-events-none absolute bottom-2 left-2 z-[500] gap-4" aria-label="Legende">
            {legend.map((entry) => (
              <li key={entry.label} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: TONE_LEGEND[entry.tone] }}
                  aria-hidden="true"
                />
                {entry.label}
              </li>
            ))}
          </ul>
        )}
      </MapView>
    </div>
  );
}
