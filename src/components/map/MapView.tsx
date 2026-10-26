"use client";

import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { circleToArea } from "@/lib/geo/area";
import { IconFit, IconLayers, IconMinus, IconNavigate, IconPlus } from "@/components/icons";
import { usePowerSaving } from "@/components/PowerSave";
import { usePrefs } from "@/components/PrefsSync";
import { powerSaving, whileActive } from "@/lib/power";
import { pref } from "@/lib/preferences";
import { useMapConfig } from "./MapConfig";
import { createLeafletEngine, loadLeaflet } from "./leaflet-engine";
import {
  createMapKitEngine,
  loadMapKit,
  mapKitFailure,
  onMapKitFailure,
} from "./mapkit-engine";
import { createMapLibreEngine, loadMapLibre } from "./maplibre-engine";
import { userMarker } from "./markers";
import {
  GERMANY,
  type LatLng,
  type MapEngine,
  type MapLayer,
  type MapProvider,
  type MapStart,
  type MapType,
} from "./types";

/** Eigener Standort samt Genauigkeit in Metern. */
export interface UserLocation {
  point: LatLng;
  accuracy: number;
}

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
  /** Standort gleich beim Oeffnen verfolgen (fragt nach der Freigabe). */
  autoLocate?: boolean;
  /** Meldet jede neue Position. */
  onLocation?: (location: UserLocation | null) => void;
}

const TYPE_KEY = "d2d.mapType";
const LOCATE: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 };

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
  // Einstellungen -> Karte -> "Dunkle Karte" aus: die Karte bleibt hell, auch wenn die App dunkel ist.
  if (!pref("mapDark")) return false;
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Eine Karte der App. Zeigt Apple Karten, wenn es eingerichtet ist, sonst
 * (oder wenn Apple ausfaellt) OpenStreetMap - mit denselben Bedienelementen.
 *
 * Im Super-Energiesparmodus: einfache Aufloesung, kein Satellitenbild, und
 * der eigene Standort kommt nur auf Antippen (einmal, nicht fortlaufend).
 */
export function MapView({
  start = GERMANY,
  className = "h-[45vh] min-h-[260px] w-full",
  onEngine,
  onFit,
  controls = true,
  children,
  autoLocate = false,
  onLocation,
}: Props) {
  const config = useMapConfig();
  const saving = usePowerSaving();
  const { mapDark, mapAutoLocate } = usePrefs();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const onEngineRef = useRef(onEngine);
  onEngineRef.current = onEngine;
  const startRef = useRef(start);
  startRef.current = start;

  const [provider, setProvider] = useState<MapProvider>(() =>
    config.provider === "apple"
      ? mapKitFailure()
        ? "openfreemap"
        : "apple"
      : config.provider,
  );
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [mapType, setMapType] = useState<MapType>("standard");
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);

  // Faellt Apple Karten aus (Token abgelehnt, nicht erreichbar), wechselt die
  // Karte still auf OpenFreeMap - arbeiten laesst sich trotzdem.
  useEffect(() => {
    if (provider !== "apple") return;
    return onMapKitFailure((message) => {
      setFallbackNote(message);
      setProvider("openfreemap");
    });
  }, [provider]);

  useEffect(() => {
    let cancelled = false;
    const element = containerRef.current;
    if (!element) return;
    // Gilt fuer diese Karte. Umgeschaltet wird im Profil - dort ist keine Karte offen.
    const savingNow = powerSaving();

    (async () => {
      let created: MapEngine;
      try {
        // Erst laden, dann pruefen, ob die Karte noch gebraucht wird - sonst
        // legen zwei Anlaeufe (React-Strict-Mode) ihre Karte in denselben Container.
        if (provider === "apple") {
          const mapkit = await loadMapKit();
          if (cancelled) return;
          created = createMapKitEngine(mapkit, element, startRef.current, isDark());
        } else if (provider === "openfreemap") {
          const ml = await loadMapLibre();
          if (cancelled) return;
          created = await createMapLibreEngine(ml, element, startRef.current, config.styles, isDark(), savingNow);
          if (cancelled) {
            created.destroy();
            return;
          }
        } else {
          const L = await loadLeaflet();
          if (cancelled) return;
          created = createLeafletEngine(L, element, startRef.current, config.tileUrl, savingNow);
        }
      } catch (error) {
        console.error("[karte]", error);
        if (!cancelled && provider === "apple") {
          setFallbackNote(error instanceof Error ? error.message : "Apple Karten ist nicht erreichbar");
          setProvider("openfreemap");
        } else if (!cancelled && provider === "openfreemap") {
          // Kein WebGL oder Kartendienst nicht erreichbar: einfache Kachelkarte.
          setProvider("osm");
        }
        return;
      }
      // Satellitenbilder sind die schwersten Kacheln - im Energiesparmodus nie.
      const type = savingNow ? "standard" : readMapType();
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
      // Leaflet und MapLibre hinterlassen Klassen am Container; fuer den
      // naechsten Anlauf leeren.
      element.replaceChildren();
      element.className = element.className
        .split(" ")
        .filter((name) => !name.startsWith("leaflet-") && !name.startsWith("maplibregl-"))
        .join(" ");
    };
    // Nur die Texte zaehlen: router.refresh() liefert ein neues Objekt mit
    // denselben Werten, und die Karte soll dabei nicht neu aufgebaut werden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, config.tileUrl, config.styles.light, config.styles.dark]);

  /* ---------------------------- Eigener Standort --------------------------- */

  const [location, setLocation] = useState<UserLocation | null>(null);
  const [watching, setWatching] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  const centerOnNextFix = useRef(false);
  const onLocationRef = useRef(onLocation);
  onLocationRef.current = onLocation;
  const meLayer = useRef<MapLayer | null>(null);

  // powerSaving()/pref() statt saving: das ist beim ersten Durchlauf noch "aus".
  // Mitverfolgen laesst sich unter Einstellungen -> Karte abschalten.
  useEffect(() => {
    if (autoLocate && !powerSaving() && pref("mapAutoLocate")) setWatching(true);
  }, [autoLocate, saving, mapAutoLocate]);

  /*
   * Verfolgt wird nur, solange die Karte zu sehen ist und bedient wird
   * (whileActive). Im Energiesparmodus einmal orten - der naechste Tipp auf
   * den Standort-Knopf ortet wieder.
   */
  useEffect(() => {
    if (!watching) return;
    if (!navigator.geolocation) {
      setLocateNote("Dieses Gerät gibt den Standort nicht frei.");
      setWatching(false);
      return;
    }
    const receive = (position: GeolocationPosition) => {
      setLocateNote(null);
      const next: UserLocation = {
        point: [position.coords.latitude, position.coords.longitude],
        accuracy: position.coords.accuracy,
      };
      setLocation(next);
      onLocationRef.current?.(next);
    };
    const fail = (error: GeolocationPositionError) => {
      setLocateNote(
        error.code === error.PERMISSION_DENIED
          ? "Standort nicht freigegeben – in den Einstellungen des Browsers erlauben."
          : "Standort gerade nicht verfügbar.",
      );
      onLocationRef.current?.(null);
    };
    if (powerSaving()) {
      let cancelled = false;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          receive(position);
          setWatching(false);
        },
        (error) => {
          if (cancelled) return;
          fail(error);
          setWatching(false);
        },
        LOCATE,
      );
      return () => {
        cancelled = true;
      };
    }
    let id: number | null = null;
    return whileActive(
      () => {
        id = navigator.geolocation.watchPosition(receive, fail, LOCATE);
      },
      () => {
        if (id !== null) navigator.geolocation.clearWatch(id);
        id = null;
      },
    );
  }, [watching, saving]);

  // Blauer Punkt mit Genauigkeitskreis - wie in jeder Karten-App.
  useEffect(() => {
    if (!engine) {
      meLayer.current = null;
      return;
    }
    if (!location) return;
    meLayer.current ??= engine.layer();
    const layer = meLayer.current;
    layer.clear();
    if (location.accuracy > 15 && location.accuracy < 2000) {
      layer.polygon(circleToArea(location.point, location.accuracy, 40), {
        color: "#0a84ff",
        weight: 1,
        fillOpacity: 0.12,
      });
    }
    layer.marker(location.point, { ...userMarker(), priority: 10 });
    if (centerOnNextFix.current) {
      centerOnNextFix.current = false;
      engine.setView(location.point, Math.max(engine.zoom(), 16));
    }
  }, [engine, location]);

  function locate() {
    if (location && engine) {
      engine.setView(location.point, Math.max(engine.zoom(), 16));
    }
    // Ohne Standort, oder im Energiesparmodus mit einem womoeglich alten: zum frischen.
    if (!location || !engine || saving) centerOnNextFix.current = true;
    setWatching(true);
  }

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

  // Hell/Dunkel wie die App (oder immer hell, siehe isDark).
  useEffect(() => {
    if (!engine) return;
    const update = () => engine.setDark(isDark());
    update();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, [engine, mapDark]);

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
          {engine.canSwitchType && !saving && (
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
          <button
            type="button"
            className="map-ctrl pointer-events-auto"
            onClick={locate}
            aria-pressed={Boolean(location)}
            title="Mein Standort"
            aria-label="Karte auf meinen Standort setzen"
          >
            <IconNavigate className="h-[18px] w-[18px]" />
          </button>
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

      {(locateNote || (fallbackNote && engine)) && (
        <p className="map-chip pointer-events-none absolute bottom-2 left-2 right-14 z-[500] mx-auto w-fit max-w-full text-center text-caption-2">
          {locateNote ?? `${fallbackNote} – Ersatzkarte wird gezeigt`}
        </p>
      )}

      {!engine && (
        <div className="absolute inset-0 z-[600] grid place-items-center bg-map-ground">
          <div className="map-loading" aria-hidden />
          <p className="sr-only">Karte wird geladen</p>
        </div>
      )}
    </div>
  );
}
