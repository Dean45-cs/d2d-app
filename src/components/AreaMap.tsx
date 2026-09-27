"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo/area";
import { MapView } from "./map/MapView";
import { badgeMarker } from "./map/markers";
import type { MapEngine } from "./map/types";
import { cssColor, progressColor } from "./map-colors";

export type AreaTone = "brand" | "success" | "warn" | "muted";
export type PinState = "open" | "active" | "done";

export interface MapArea {
  id: number;
  name: string;
  area: LatLng[];
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

const TONE_VARS: Record<AreaTone, [string, string]> = {
  brand: ["--brand-600", "#0f5cab"],
  success: ["--energy-600", "#059450"],
  warn: ["--gas-500", "#f59e0b"],
  muted: ["--ink-muted", "#5b6b82"],
};

/** Zeigt gezeichnete Gebiete und ihre Strassen auf einer Karte. */
export function AreaMap({ areas, pins = [], legend, className, onSelect }: Props) {
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const allPoints = useMemo<LatLng[]>(
    () => [
      ...areas.flatMap((item) => (item.area.length >= 3 ? item.area : [])),
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

    for (const item of areas) {
      if (item.area.length < 3) continue;
      const [variable, fallback] = TONE_VARS[item.tone ?? "brand"];
      const color = cssColor(variable, fallback);
      const open = clickable ? () => selectRef.current?.(item.id) : undefined;
      layer.polygon(item.area, {
        color,
        weight: 2.5,
        fillOpacity: 0.18,
        title: item.name,
        subtitle: item.hint,
        onClick: open,
      });
      if (item.badge) {
        layer.marker(middleOf(item.area), {
          ...badgeMarker(color, item.badge),
          title: item.name,
          subtitle: item.hint,
          onClick: open,
          priority: 2,
        });
      }
    }

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
    return () => layer.clear();
    // fitAll haengt an denselben Daten; nur bei neuen Daten neu zeichnen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, areas, pins]);

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

/** Mitte der Flaeche (Mittel der Eckpunkte) - dort sitzt das Schild. */
function middleOf(area: LatLng[]): LatLng {
  let south = 90;
  let north = -90;
  let west = 180;
  let east = -180;
  for (const [lat, lng] of area) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return [(south + north) / 2, (west + east) / 2];
}
