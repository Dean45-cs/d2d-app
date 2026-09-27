"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconFit, IconLayers, IconMinus, IconPlus } from "@/components/icons";
import { useMapConfig } from "./MapConfig";
import { createLeafletEngine, loadLeaflet } from "./leaflet-engine";
import {
  createMapKitEngine,
  loadMapKit,
  mapKitFailure,
  onMapKitFailure,
} from "./mapkit-engine";
import { GERMANY, type MapEngine, type MapProvider, type MapStart, type MapType } from "./types";

interface Props {
  start?: MapStart;
  /** Hoehe der Karte als Tailwind-Klassen */
  className?: string;
  /** Meldet die fertige Karte - und null, sobald sie wieder verschwindet. */
  onEngine: (engine: MapEngine | null) => void;
  /** Zeigt einen Knopf, der alles wieder ins Bild holt. */
  onFit?: () => void;
  /** Zoom- und Ebenen-Knoepfe (Standard: an) */
  controls?: boolean;
  /** Eigene Bedienelemente, die ueber der Karte liegen */
  children?: ReactNode;
}

const TYPE_KEY = "d2d.mapType";

function readMapType(): MapType {
  try {
    return localStorage.getItem(TYPE_KEY) === "hybrid" ? "hybrid" : "standard";
  } catch {
    return "standard";
  }
}

function storeMapType(type: MapType) {
  try {
    localStorage.setItem(TYPE_KEY, type);
  } catch {
    // Privater Modus: dann eben nur fuer diese Seite.
  }
}

function isDark(): boolean {
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Eine Karte der App. Zeigt Apple Karten, wenn es eingerichtet ist, sonst
 * (oder wenn Apple ausfaellt) OpenStreetMap - mit denselben Bedienelementen.
 */
export function MapView({
  start = GERMANY,
  className = "h-[45vh] min-h-[260px] w-full",
  onEngine,
  onFit,
  controls = true,
  children,
}: Props) {
  const config = useMapConfig();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const onEngineRef = useRef(onEngine);
  onEngineRef.current = onEngine;
  const startRef = useRef(start);
  startRef.current = start;

  const [provider, setProvider] = useState<MapProvider>(() =>
    config.provider === "apple" && !mapKitFailure() ? "apple" : "osm",
  );
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [mapType, setMapType] = useState<MapType>("standard");
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);

  // Faellt Apple Karten aus (Token abgelehnt, nicht erreichbar), wechselt die
  // Karte still auf OpenStreetMap - arbeiten laesst sich trotzdem.
  useEffect(() => {
    if (provider !== "apple") return;
    return onMapKitFailure((message) => {
      setFallbackNote(message);
      setProvider("osm");
    });
  }, [provider]);

  useEffect(() => {
    let cancelled = false;
    const element = containerRef.current;
    if (!element) return;

    (async () => {
      let created: MapEngine;
      try {
        // Erst laden, dann pruefen, ob die Karte noch gebraucht wird - sonst
        // legen zwei Anlaeufe (React-Strict-Mode) ihre Karte in denselben Container.
        if (provider === "apple") {
          const mapkit = await loadMapKit();
          if (cancelled) return;
          created = createMapKitEngine(mapkit, element, startRef.current, isDark());
        } else {
          const L = await loadLeaflet();
          if (cancelled) return;
          created = createLeafletEngine(L, element, startRef.current, config.tileUrl);
        }
      } catch (error) {
        console.error("[karte]", error);
        if (!cancelled && provider === "apple") {
          setFallbackNote(error instanceof Error ? error.message : "Apple Karten ist nicht erreichbar");
          setProvider("osm");
        }
        return;
      }
      const type = readMapType();
      if (created.canSwitchType) created.setMapType(type);
      setMapType(type);
      engineRef.current = created;
      setEngine(created);
      onEngineRef.current(created);
    })();

    return () => {
      cancelled = true;
      const current = engineRef.current;
      engineRef.current = null;
      setEngine(null);
      onEngineRef.current(null);
      current?.destroy();
      // Leaflet hinterlaesst Klassen am Container; fuer den naechsten Anlauf leeren.
      element.replaceChildren();
      element.className = element.className
        .split(" ")
        .filter((name) => !name.startsWith("leaflet-"))
        .join(" ");
    };
  }, [provider, config.tileUrl]);

  // Groesse nachfuehren (Dialog, Drehen des Handys, Seitenleiste).
  useEffect(() => {
    if (!engine || !containerRef.current) return;
    const timer = window.setTimeout(() => engine.resize(), 150);
    const observer = new ResizeObserver(() => engine.resize());
    observer.observe(containerRef.current);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [engine]);

  // Hell/Dunkel wie die App.
  useEffect(() => {
    if (!engine) return;
    const update = () => engine.setDark(isDark());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, [engine]);

  function toggleType() {
    if (!engine) return;
    const next: MapType = mapType === "standard" ? "hybrid" : "standard";
    engine.setMapType(next);
    setMapType(next);
    storeMapType(next);
  }

  return (
    <div className="map-view relative isolate">
      <div ref={containerRef} className={className} />

      {children}

      {controls && engine && (
        <div className="pointer-events-none absolute bottom-8 right-2 z-[500] flex flex-col items-end gap-2">
          {engine.canSwitchType && (
            <button
              type="button"
              className="map-ctrl pointer-events-auto"
              onClick={toggleType}
              aria-pressed={mapType === "hybrid"}
              title={mapType === "hybrid" ? "Kartenansicht" : "Satellitenansicht"}
              aria-label={mapType === "hybrid" ? "Kartenansicht zeigen" : "Satellitenansicht zeigen"}
            >
              <IconLayers className="h-[18px] w-[18px]" />
            </button>
          )}
          {onFit && (
            <button
              type="button"
              className="map-ctrl pointer-events-auto"
              onClick={onFit}
              title="Alles zeigen"
              aria-label="Alles ins Bild holen"
            >
              <IconFit className="h-[18px] w-[18px]" />
            </button>
          )}
          <div className="map-ctrl-group pointer-events-auto">
            <button type="button" onClick={() => engine.zoomBy(1)} aria-label="Hineinzoomen">
              <IconPlus className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => engine.zoomBy(-1)} aria-label="Herauszoomen">
              <IconMinus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {fallbackNote && engine && (
        <p className="map-chip pointer-events-none absolute bottom-2 left-1/2 z-[500] -translate-x-1/2 whitespace-nowrap text-[10px]">
          {fallbackNote} – OpenStreetMap wird gezeigt
        </p>
      )}

      {!engine && (
        <div className="absolute inset-0 z-[600] grid place-items-center bg-[var(--card-inset)]">
          <div className="map-loading" aria-hidden />
          <p className="sr-only">Karte wird geladen</p>
        </div>
      )}
    </div>
  );
}
