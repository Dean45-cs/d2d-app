"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LatLng } from "@/lib/geo/area";
import { labelPoint, resolveOverlaps, shapePoints, type Shape } from "@/lib/geo/shape";
import { MapView } from "./map/MapView";
import { declutter, type Placeable } from "./map/declutter";
import { avatarMarker, badgeMarker } from "./map/markers";
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
  /** Kuerzel, das dauerhaft auf der Flaeche steht - wenn keine Person dazu gehoert. */
  badge?: string;
  /** Wer das Gebiet bearbeitet: Profilbild (sonst Kuerzel im Ton der Person) auf der Flaeche. */
  person?: { name: string; avatar: string; tone: string } | null;
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
/** Profilbilder etwas groesser als Kuerzel - ein Gesicht braucht Platz, um erkannt zu werden. */
const AVATAR_SIZE = 34;

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
      const label = item.person || item.badge ? labelPoint(visible) : null;
      if (label) {
        const size = item.person ? AVATAR_SIZE : BADGE_SIZE;
        const handle = layer.marker(label.point, {
          ...(item.person ? avatarMarker(color, item.person, size) : badgeMarker(color, item.badge ?? "", size)),
          title: item.name,
          subtitle: item.hint,
          onClick: open,
          priority: 2,
        });
        badges.push({ point: label.point, size: [size, size], rank: label.room, handle });
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
          // Rechts bleibt die Spalte der Kartenknoepfe frei; reicht der Platz nicht, bricht die Legende um.
          <ul
            className="map-chip pointer-events-none absolute bottom-2 left-2 right-14 z-[500] w-fit flex-wrap gap-x-3 gap-y-1 px-3 py-2 text-caption-2"
            aria-label="Legende"
          >
            {legend.map((entry) => (
              <li key={entry.label} className="flex items-center gap-1.5">
                {/* Wie die Flaeche auf der Karte: Randfarbe, Fuellung und - fuer
                    pausierte Gebiete - gestrichelt. Offen und Pause teilen die
                    Farbe und unterscheiden sich nur am Strich. */}
                <span
                  className="h-2.5 w-2.5 rounded-xs border-2"
                  style={{
                    borderColor: TONE_LEGEND[entry.tone],
                    borderStyle: entry.tone === "paused" ? "dashed" : "solid",
                    background: `color-mix(in srgb, ${TONE_LEGEND[entry.tone]} ${entry.tone === "active" ? 16 : 8}%, transparent)`,
                  }}
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
