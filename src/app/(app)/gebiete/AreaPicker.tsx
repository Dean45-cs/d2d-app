"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { areaSqKm, circleToArea, type LatLng } from "@/lib/geo/area";
import { cssColor } from "@/components/map-colors";
import { plural } from "@/components/ui";

export interface ExistingArea {
  id: number;
  name: string;
  area: LatLng[];
}

interface Props {
  tileUrl: string;
  /** Meldet die gezeichnete Flaeche nach oben, null solange nichts markiert ist. */
  onAreaChange: (area: LatLng[] | null) => void;
  /** Schon vergebene Gebiete - damit sich nichts ueberschneidet. */
  existing?: ExistingArea[];
  /** Startausschnitt der Karte. */
  start?: { lat: number; lng: number; zoom: number };
}

type Mode = "circle" | "polygon";

const DEFAULT_START = { lat: 51.2, lng: 10.4, zoom: 6 };
const RADIUS_STEPS = [150, 250, 400, 600, 800, 1200, 1600, 2000];

/**
 * Karte zum Abstecken eines Gebiets.
 *
 * Zwei Wege, beide mit dem Daumen bedienbar:
 *  - Umkreis: einmal auf die Karte tippen, Groesse ueber den Regler
 *  - Fläche: Ecke fuer Ecke antippen, Punkte lassen sich nachziehen
 */
export function AreaPicker({ tileUrl, onAreaChange, existing = [], start }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const drawLayerRef = useRef<LayerGroup | null>(null);
  const existingLayerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  const [mode, setMode] = useState<Mode>("circle");
  const [center, setCenter] = useState<LatLng | null>(null);
  const [radius, setRadius] = useState(600);
  const [points, setPoints] = useState<LatLng[]>([]);
  const [ready, setReady] = useState(false);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<{ label: string; lat: number; lng: number }>>([]);
  const [searching, setSearching] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  // Klick-Handler laufen ausserhalb von React - der aktuelle Modus kommt aus Refs.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const changeRef = useRef(onAreaChange);
  changeRef.current = onAreaChange;

  /* ------------------------------ Karte bauen ----------------------------- */

  useEffect(() => {
    let cancelled = false;
    let sizeTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center: [start?.lat ?? DEFAULT_START.lat, start?.lng ?? DEFAULT_START.lng],
        zoom: start?.zoom ?? DEFAULT_START.zoom,
        zoomControl: true,
        scrollWheelZoom: true,
      });
      L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap-Mitwirkende",
      }).addTo(map);

      existingLayerRef.current = L.layerGroup().addTo(map);
      drawLayerRef.current = L.layerGroup().addTo(map);

      map.on("click", (event: { latlng: { lat: number; lng: number } }) => {
        const point: LatLng = [event.latlng.lat, event.latlng.lng];
        if (modeRef.current === "circle") {
          setCenter(point);
          // Aus der Uebersichtshoehe heraus waere der Umkreis reine Glueckssache.
          if (map.getZoom() < 13) map.flyTo(point, 15, { duration: 0.6 });
        } else {
          setPoints((prev) => (prev.length >= 60 ? prev : [...prev, point]));
        }
      });

      mapRef.current = map;
      setReady(true);
      // Im Dialog wird die Karte erst nach dem Einblenden vermessen.
      sizeTimer = setTimeout(() => map.invalidateSize(), 150);
    })();

    return () => {
      cancelled = true;
      clearTimeout(sizeTimer);
      // Laufende Flug-/Zoom-Animation zuerst stoppen.
      mapRef.current?.stop();
      mapRef.current?.remove();
      mapRef.current = null;
      drawLayerRef.current = null;
      existingLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileUrl]);

  // Karte an Groessenaenderungen anpassen (Dialog, Drehen des Handys).
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const observer = new ResizeObserver(() => mapRef.current?.invalidateSize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [ready]);

  /* -------------------- Flaeche aus der Eingabe ableiten ------------------- */

  const area = useMemo(
    () =>
      mode === "circle"
        ? center
          ? circleToArea(center, radius)
          : null
        : points.length >= 3
          ? points
          : null,
    [mode, center, radius, points],
  );

  useEffect(() => {
    changeRef.current(area);
  }, [area]);

  /* ------------------------------- Zeichnen ------------------------------- */

  // Bereits vergebene Gebiete als Hintergrund
  useEffect(() => {
    const L = leafletRef.current;
    const layer = existingLayerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    for (const item of existing) {
      if (item.area.length < 3) continue;
      L.polygon(item.area, {
        color: cssColor("--ink-muted", "#5b6b82"),
        weight: 1.5,
        dashArray: "5 4",
        fillOpacity: 0.08,
        interactive: true,
        bubblingMouseEvents: true,
      })
        .bindTooltip(`Schon vergeben: ${item.name}`, { direction: "top" })
        .addTo(layer);
    }
  }, [ready, existing]);

  // Aktuelle Auswahl samt Eckpunkten
  useEffect(() => {
    const L = leafletRef.current;
    const layer = drawLayerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();

    const brand = cssColor("--brand-600", "#0f5cab");

    if (mode === "circle" && center) {
      L.polygon(circleToArea(center, radius, 48), {
        color: brand,
        weight: 2,
        fillOpacity: 0.16,
        bubblingMouseEvents: true,
      }).addTo(layer);
      L.marker(center, { icon: dotIcon(L, brand, 14), draggable: true, keyboard: false })
        .on("dragend", (event: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
          const p = event.target.getLatLng();
          setCenter([p.lat, p.lng]);
        })
        .addTo(layer);
      return;
    }

    if (mode === "polygon" && points.length > 0) {
      if (points.length >= 3) {
        L.polygon(points, {
          color: brand,
          weight: 2,
          fillOpacity: 0.16,
          bubblingMouseEvents: true,
        }).addTo(layer);
      } else {
        L.polyline(points, { color: brand, weight: 2, dashArray: "6 5" }).addTo(layer);
      }
      points.forEach((point, index) => {
        L.marker(point, { icon: dotIcon(L, brand, 12), draggable: true, keyboard: false })
          .on("dragend", (event: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
            const p = event.target.getLatLng();
            setPoints((prev) => prev.map((old, i) => (i === index ? [p.lat, p.lng] : old)));
          })
          .addTo(layer);
      });
    }
  }, [ready, mode, center, radius, points]);

  /* ------------------------------- Aktionen ------------------------------- */

  const flyTo = useCallback((lat: number, lng: number, zoom: number) => {
    mapRef.current?.flyTo([lat, lng], zoom, { duration: 0.8 });
  }, []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    setHint(null);
    setHits([]);
    try {
      const response = await fetch("/api/geo/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      if (!response.ok) {
        setHint(data.error ?? "Die Ortssuche hat nicht geklappt.");
        return;
      }
      if (data.results.length === 0) {
        setHint("Nichts gefunden. Versuch es mit PLZ und Ort, z. B. „44135 Dortmund“.");
        return;
      }
      setHits(data.results);
      const first = data.results[0];
      flyTo(first.lat, first.lng, 15);
    } catch {
      setHint("Die Ortssuche ist nicht erreichbar.");
    } finally {
      setSearching(false);
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setHint("Dieses Gerät gibt den Standort nicht frei.");
      return;
    }
    setHint(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        flyTo(latitude, longitude, 16);
        if (modeRef.current === "circle") setCenter([latitude, longitude]);
      },
      () => setHint("Standort nicht verfügbar – bitte die Freigabe im Browser erlauben."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function reset() {
    setCenter(null);
    setPoints([]);
    setHint(null);
  }

  const size = area ? areaSqKm(area) : 0;

  return (
    <div className="space-y-2">
      <form onSubmit={search} className="flex gap-2">
        <input
          className="input"
          placeholder="Ort oder PLZ suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
        />
        <button type="submit" className="btn btn-ghost shrink-0" disabled={searching}>
          {searching ? "…" : "Suchen"}
        </button>
        <button type="button" className="btn btn-ghost shrink-0" onClick={locate} title="Mein Standort">
          📍
        </button>
      </form>

      {hits.length > 1 && (
        <ul className="max-h-32 overflow-y-auto rounded-xl border text-sm hairline">
          {hits.map((hit, index) => (
            <li key={`${hit.lat}-${hit.lng}-${index}`}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-brand-500/8"
                onClick={() => {
                  flyTo(hit.lat, hit.lng, 15);
                  if (modeRef.current === "circle") setCenter([hit.lat, hit.lng]);
                  setHits([]);
                }}
              >
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-xl border hairline">
          {(
            [
              { value: "circle", label: "Umkreis" },
              { value: "polygon", label: "Fläche zeichnen" },
            ] as Array<{ value: Mode; label: string }>
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setMode(option.value);
                setHint(null);
              }}
              className={`px-3 py-1.5 text-sm font-semibold ${
                mode === option.value ? "bg-brand-600 text-white" : ""
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode === "polygon" && points.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost px-3 py-1.5 text-sm"
            onClick={() => setPoints((prev) => prev.slice(0, -1))}
          >
            Punkt zurück
          </button>
        )}
        {(center || points.length > 0) && (
          <button type="button" className="btn btn-ghost px-3 py-1.5 text-sm" onClick={reset}>
            Neu setzen
          </button>
        )}
      </div>

      {mode === "circle" && (
        <div className="flex items-center gap-3">
          <label className="muted shrink-0 text-xs font-semibold" htmlFor="radius">
            Umkreis
          </label>
          <input
            id="radius"
            type="range"
            className="flex-1 accent-[var(--brand-600)]"
            min={0}
            max={RADIUS_STEPS.length - 1}
            step={1}
            value={Math.max(0, RADIUS_STEPS.indexOf(radius))}
            onChange={(e) => setRadius(RADIUS_STEPS[Number(e.target.value)])}
          />
          <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
            {radius < 1000 ? `${radius} m` : `${(radius / 1000).toLocaleString("de-DE")} km`}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border hairline">
        <div ref={containerRef} className="h-[44vh] min-h-[260px] w-full" />
      </div>

      <p className="muted text-xs">
        {area
          ? `Gebiet markiert · ${size.toFixed(2).replace(".", ",")} km²${
              mode === "polygon" ? ` · ${plural(points.length, "Eckpunkt", "Eckpunkte")}` : ""
            }`
          : mode === "circle"
            ? "Auf die Karte tippen – der Umkreis ist das Gebiet."
            : "Ecken nacheinander antippen (mindestens drei), Punkte lassen sich verschieben."}
      </p>

      {hint && <p className="text-xs font-semibold text-signal-600">{hint}</p>}
    </div>
  );
}

/** Kleiner runder Griff - kommt ohne die Leaflet-Bilddateien aus. */
function dotIcon(L: typeof import("leaflet"), color: string, size: number) {
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgb(15 23 42 / .45)"></span>`,
  });
}
