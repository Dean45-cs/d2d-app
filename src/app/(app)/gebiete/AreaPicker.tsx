"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { areaSqKm, circleToArea, type LatLng } from "@/lib/geo/area";
import { cssColor } from "@/components/map-colors";
import { MapView } from "@/components/map/MapView";
import { badgeMarker, handleMarker, labelMarker } from "@/components/map/markers";
import type { MapEngine, MapLayer } from "@/components/map/types";
import { plural, Segmented } from "@/components/ui";
import {
  IconCircleArea,
  IconCrosshair,
  IconInfo,
  IconPin,
  IconPolygonArea,
  IconSearch,
} from "@/components/icons";

export interface ExistingArea {
  id: number;
  name: string;
  area: LatLng[];
}

/** Eine gefundene Strasse, wie sie in der Vorschau erscheint. */
export interface OverlayStreet {
  name: string;
  points: LatLng[];
  center: LatLng | null;
  /** Farbe des Pakets; null = nicht ausgewaehlt und deshalb blass. */
  color: string | null;
}

/** Umriss eines Teilgebiets mit seiner Nummer. */
export interface OverlayPlot {
  label: string;
  area: LatLng[];
  color: string;
}

interface Props {
  /** Meldet die gezeichnete Flaeche nach oben, null solange nichts markiert ist. */
  onAreaChange: (area: LatLng[] | null) => void;
  /** Schon vergebene Gebiete - damit sich nichts ueberschneidet. */
  existing?: ExistingArea[];
  /** Gefundene Strassen samt Hausnummern als Vorschau. */
  overlay?: OverlayStreet[];
  /** Umrisse der Teilgebiete beim Aufteilen. */
  plots?: OverlayPlot[];
  /** Strasse, auf die die Karte springt (Name aus overlay). */
  focus?: string | null;
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
 *
 * Sind die Strassen geladen, liegen die gefundenen Hausnummern als Punkte auf
 * der Karte - man sieht also vor dem Speichern, wie viel Substanz das Gebiet hat.
 */
export function AreaPicker({
  onAreaChange,
  existing = [],
  overlay = [],
  plots = [],
  focus = null,
  start,
}: Props) {
  const [engine, setEngine] = useState<MapEngine | null>(null);
  // Drei Ebenen uebereinander: vergebene Gebiete, Vorschau, eigene Auswahl.
  const [layers, setLayers] = useState<{
    existing: MapLayer;
    overlay: MapLayer;
    draw: MapLayer;
  } | null>(null);

  const [mode, setMode] = useState<Mode>("circle");
  const [center, setCenter] = useState<LatLng | null>(null);
  const [radius, setRadius] = useState(600);
  const [points, setPoints] = useState<LatLng[]>([]);

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

  const mapStart = useMemo(
    () => ({
      center: [start?.lat ?? DEFAULT_START.lat, start?.lng ?? DEFAULT_START.lng] as LatLng,
      zoom: start?.zoom ?? DEFAULT_START.zoom,
    }),
    // Nur der erste Ausschnitt zaehlt - danach bewegt sich die Karte selbst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!engine) {
      setLayers(null);
      return;
    }
    setLayers({ existing: engine.layer(), overlay: engine.layer(), draw: engine.layer() });
    engine.onTap((point) => {
      if (modeRef.current === "circle") {
        setCenter(point);
        // Aus der Uebersichtshoehe heraus waere der Umkreis reine Glueckssache.
        if (engine.zoom() < 13) engine.setView(point, 15);
      } else {
        setPoints((prev) => (prev.length >= 60 ? prev : [...prev, point]));
      }
    });
    return () => engine.onTap(null);
  }, [engine]);

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

  // Bereits vergebene Gebiete als Hintergrund - mit Namen, damit klar ist, wem sie gehoeren.
  useEffect(() => {
    const layer = layers?.existing;
    if (!layer) return;
    const muted = cssColor("--ink-muted", "#5b6b82");
    for (const item of existing) {
      if (item.area.length < 3) continue;
      layer.polygon(item.area, {
        color: muted,
        weight: 1.5,
        dashed: true,
        fillOpacity: 0.08,
        title: `Schon vergeben: ${item.name}`,
      });
      layer.marker(middleOf(item.area), labelMarker(item.name));
    }
    return () => layer.clear();
  }, [layers, existing]);

  // Gefundene Hausnummern und Teilgebiete
  useEffect(() => {
    const layer = layers?.overlay;
    if (!layer) return;
    const muted = cssColor("--ink-muted", "#5b6b82");

    // Der Umriss ist nur eine Andeutung - welche Strassen zu welchem Paket
    // gehoeren, sagen die farbigen Punkte. Deshalb bleibt er zurueckhaltend.
    for (const plot of plots) {
      if (plot.area.length < 3) continue;
      layer.polygon(plot.area, {
        color: plot.color,
        weight: 1.5,
        dashed: true,
        fillOpacity: 0.06,
      });
    }

    for (const street of overlay) {
      const chosen = street.color !== null;
      for (const point of street.points) {
        layer.dot(point, {
          color: chosen ? street.color! : muted,
          radius: chosen ? 3.5 : 2.5,
          opacity: chosen ? 0.9 : 0.3,
        });
      }
    }

    // Die Zahl im Kreis ist die eigentliche Kennzeichnung - Farbe allein
    // reicht nicht, wenn jemand Farben schlecht unterscheidet.
    for (const plot of plots) {
      if (plot.area.length < 3) continue;
      const middle = plot.area.reduce(
        (acc, [lat, lng]) => [acc[0] + lat / plot.area.length, acc[1] + lng / plot.area.length],
        [0, 0],
      ) as LatLng;
      layer.marker(middle, { ...badgeMarker(plot.color, plot.label), priority: 2 });
    }
    return () => layer.clear();
  }, [layers, overlay, plots]);

  // Auf eine Strasse springen, wenn sie in der Liste angetippt wird
  useEffect(() => {
    if (!engine || !focus) return;
    const street = overlay.find((s) => s.name === focus);
    const target = street?.center ?? street?.points[0] ?? null;
    if (!target) return;
    engine.setView(target, Math.max(engine.zoom(), 16));
  }, [engine, focus, overlay]);

  // Aktuelle Auswahl samt Eckpunkten
  useEffect(() => {
    const layer = layers?.draw;
    if (!layer) return;

    const brand = cssColor("--brand-600", "#0f5cab");

    if (mode === "circle" && center) {
      layer.polygon(circleToArea(center, radius, 64), {
        color: brand,
        weight: 2.5,
        fillOpacity: 0.12,
      });
      layer.marker(center, {
        ...handleMarker(brand, 18),
        draggable: true,
        priority: 3,
        onDragEnd: (point) => setCenter(point),
      });
    } else if (mode === "polygon" && points.length > 0) {
      if (points.length >= 3) {
        layer.polygon(points, { color: brand, weight: 2.5, fillOpacity: 0.12 });
      } else {
        layer.line(points, { color: brand, weight: 2.5, dashed: true });
      }
      points.forEach((point, index) => {
        layer.marker(point, {
          ...handleMarker(brand, 14),
          draggable: true,
          priority: 3,
          onDragEnd: (moved) =>
            setPoints((prev) => prev.map((old, i) => (i === index ? moved : old))),
        });
      });
    }
    return () => layer.clear();
  }, [layers, mode, center, radius, points]);

  /* ------------------------------- Aktionen ------------------------------- */

  const flyTo = useCallback(
    (lat: number, lng: number, zoom: number) => engine?.setView([lat, lng], zoom),
    [engine],
  );

  async function search() {
    if (query.trim().length < 3) {
      setHint("Bitte mindestens drei Zeichen eingeben.");
      return;
    }
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
  const sizeLabel = `${size.toFixed(2).replace(".", ",")} km²`;

  return (
    <div className="space-y-2.5">
      {/* ------------------------------ Ortssuche ----------------------------- */}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <IconSearch className="muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            className="input pl-9"
            placeholder="Ort oder PLZ suchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter sucht - und darf auf keinen Fall das Gebiet anlegen.
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            enterKeyHint="search"
            aria-label="Ort oder PLZ suchen"
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost shrink-0 px-3.5"
          onClick={() => void search()}
          disabled={searching}
        >
          {searching ? "…" : "Suchen"}
        </button>
        <button
          type="button"
          className="btn btn-ghost shrink-0 px-3"
          onClick={locate}
          title="Mein Standort"
          aria-label="Karte auf meinen Standort setzen"
        >
          <IconCrosshair className="h-[18px] w-[18px]" />
        </button>
      </div>

      {hits.length > 1 && (
        <ul className="list max-h-40 overflow-y-auto">
          {hits.map((hit, index) => (
            <li key={`${hit.lat}-${hit.lng}-${index}`}>
              <button
                type="button"
                className="list-row text-sm"
                onClick={() => {
                  flyTo(hit.lat, hit.lng, 15);
                  if (modeRef.current === "circle") setCenter([hit.lat, hit.lng]);
                  setHits([]);
                }}
              >
                <IconPin className="muted h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{hit.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ---------------------------- Art der Auswahl ------------------------- */}
      <Segmented
        options={[
          { value: "circle", label: "Umkreis", icon: <IconCircleArea className="h-4 w-4" /> },
          { value: "polygon", label: "Fläche zeichnen", icon: <IconPolygonArea className="h-4 w-4" /> },
        ]}
        value={mode}
        onChange={(next: Mode) => {
          setMode(next);
          setHint(null);
        }}
        ariaLabel="Wie soll das Gebiet abgesteckt werden?"
      />

      {mode === "circle" && (
        <div className="flex items-center gap-3 px-0.5">
          <label className="muted shrink-0 text-xs font-semibold" htmlFor="radius">
            Umkreis
          </label>
          <input
            id="radius"
            type="range"
            className="slider flex-1"
            min={0}
            max={RADIUS_STEPS.length - 1}
            step={1}
            value={Math.max(0, RADIUS_STEPS.indexOf(radius))}
            onChange={(e) => setRadius(RADIUS_STEPS[Number(e.target.value)])}
          />
          <span
            className="w-[4.25rem] shrink-0 rounded-full py-1 text-center text-[13px] font-bold tabular-nums"
            style={{
              background: "color-mix(in srgb, var(--brand-500) 12%, transparent)",
              color: "var(--tint)",
            }}
          >
            {radius < 1000 ? `${radius} m` : `${(radius / 1000).toLocaleString("de-DE")} km`}
          </span>
        </div>
      )}

      {/* -------------------------------- Karte ------------------------------- */}
      <div
        className="relative overflow-hidden rounded-[var(--r-lg)] border"
        style={{ borderColor: "var(--line)" }}
      >
        <MapView start={mapStart} className="h-[46vh] min-h-[280px] w-full" onEngine={setEngine}>
        {/* Die Kennzahl der Auswahl liegt auf der Karte - dort schaut man hin. */}
        <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] flex items-start justify-between gap-2">
          <span className="map-chip pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-[var(--ink)]">
            {area ? (
              <>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: "var(--brand-600)" }}
                  aria-hidden
                />
                {sizeLabel}
                {mode === "polygon" && ` · ${plural(points.length, "Ecke", "Ecken")}`}
              </>
            ) : (
              <>
                <IconInfo className="h-3.5 w-3.5" />
                {mode === "circle" ? "Auf die Karte tippen" : "Ecken antippen"}
              </>
            )}
          </span>

          <span className="pointer-events-auto flex gap-1.5">
            {mode === "polygon" && points.length > 0 && (
              <button
                type="button"
                className="map-chip px-3 py-1.5 text-[12px] text-[var(--ink)]"
                onClick={() => setPoints((prev) => prev.slice(0, -1))}
              >
                Punkt zurück
              </button>
            )}
            {(center || points.length > 0) && (
              <button
                type="button"
                className="map-chip px-3 py-1.5 text-[12px] text-[var(--ink)]"
                onClick={reset}
              >
                Neu setzen
              </button>
            )}
          </span>
        </div>
        </MapView>
      </div>

      <p className="muted px-0.5 text-[11px] leading-snug">
        {mode === "circle"
          ? "Auf die Karte tippen – der Umkreis ist das Gebiet. Der Mittelpunkt lässt sich ziehen."
          : "Ecken nacheinander antippen (mindestens drei). Jeder Punkt lässt sich verschieben."}
      </p>

      {hint && (
        <p className="text-[12px] font-semibold text-danger">{hint}</p>
      )}
    </div>
  );
}

/** Mitte der Flaeche (Mittel der Ausdehnung) - dort steht der Name. */
function middleOf(area: LatLng[]): LatLng {
  const lats = area.map(([lat]) => lat);
  const lngs = area.map(([, lng]) => lng);
  return [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ];
}
