"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { LatLng } from "@/lib/geo/area";
import { cssColor } from "./map-colors";

export type AreaTone = "brand" | "success" | "warn" | "muted";

export interface MapArea {
  id: number;
  name: string;
  area: LatLng[];
  tone?: AreaTone;
  hint?: string;
}

export interface MapPin {
  lat: number;
  lng: number;
  label: string;
  hint?: string;
  done?: boolean;
}

interface Props {
  tileUrl: string;
  areas: MapArea[];
  pins?: MapPin[];
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
export function AreaMap({ tileUrl, areas, pins = [], className, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let sizeTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { center: [51.2, 10.4], zoom: 6 });
      L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap-Mitwirkende",
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
      sizeTimer = setTimeout(() => map.invalidateSize(), 150);
    })();
    return () => {
      cancelled = true;
      clearTimeout(sizeTimer);
      // Laufende Flug-/Zoom-Animation zuerst stoppen.
      mapRef.current?.stop();
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [tileUrl]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    const bounds = L.latLngBounds([]);

    for (const item of areas) {
      if (item.area.length < 3) continue;
      const [variable, fallback] = TONE_VARS[item.tone ?? "brand"];
      const color = cssColor(variable, fallback);
      const polygon = L.polygon(item.area, {
        color,
        weight: 2,
        fillOpacity: 0.16,
      })
        .bindTooltip(item.hint ? `<strong>${item.name}</strong><br>${item.hint}` : item.name, {
          direction: "top",
        })
        .addTo(layer);
      if (selectRef.current) {
        polygon.on("click", () => selectRef.current?.(item.id));
      }
      bounds.extend(polygon.getBounds());
    }

    for (const pin of pins) {
      const color = cssColor(...(pin.done ? TONE_VARS.success : TONE_VARS.brand));
      const marker = L.circleMarker([pin.lat, pin.lng], {
        radius: 6,
        color: "#ffffff",
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.9,
      })
        .bindTooltip(pin.hint ? `<strong>${pin.label}</strong><br>${pin.hint}` : pin.label, {
          direction: "top",
        })
        .addTo(layer);
      bounds.extend(marker.getLatLng());
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17, animate: false });
    }
  }, [ready, areas, pins]);

  return (
    <div className="overflow-hidden rounded-xl border hairline">
      <div ref={containerRef} className={className ?? "h-[45vh] min-h-[260px] w-full"} />
    </div>
  );
}
