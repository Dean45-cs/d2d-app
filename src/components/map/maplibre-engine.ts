import type {
  GeoJSONSource,
  Map as MlMap,
  MapGeoJSONFeature,
  MapMouseEvent,
  Marker,
} from "maplibre-gl";
import type {
  DotOptions,
  LatLng,
  MapAction,
  MapEngine,
  MapLayer,
  MapStart,
  MarkerHandle,
  MarkerOptions,
  ShapeOptions,
} from "./types";
import { ringsOf } from "./types";

/*
 * OpenFreeMap ueber MapLibre GL: Vektorkarten, kostenlos, ohne Schluessel
 * und ohne Limit. Gebiete, Linien und Punkte werden direkt auf der
 * Grafikkarte gezeichnet - auch Tausende Hausnummern bleiben fluessig.
 *
 * MapLibre rechnet mit 512-Pixel-Kacheln, die Seiten mit den gewohnten
 * Zoomstufen der 256-Pixel-Kachelkarten ("15 = Strasse"). Die Engine
 * verschiebt deshalb um eine Stufe.
 */

export type MapLibre = typeof import("maplibre-gl");

export function loadMapLibre(): Promise<MapLibre> {
  return import("maplibre-gl").then((module) => (module.default ?? module) as MapLibre);
}

const LOAD_TIMEOUT_MS = 15_000;
const ZOOM_OFFSET = 1;

interface Handler {
  onClick?: () => void;
  title?: string;
  subtitle?: string;
  actions?: MapAction[];
  /** Punkte gewinnen gegen Flaechen, wenn beides unter dem Finger liegt. */
  kind: "shape" | "dot";
}

interface LayerImpl extends MapLayer {
  id: string;
  install(): void;
  /** Nach einem Stilwechsel: Quelle und Ebenen neu anlegen, Daten wieder rein. */
  refresh(): void;
}

export async function createMapLibreEngine(
  ml: MapLibre,
  element: HTMLElement,
  start: MapStart,
  styles: { light: string; dark: string },
  dark: boolean,
): Promise<MapEngine> {
  const map: MlMap = new ml.Map({
    container: element,
    style: dark ? styles.dark : styles.light,
    center: [start.center[1], start.center[0]],
    zoom: start.zoom - ZOOM_OFFSET,
    attributionControl: { compact: true },
    // Drehen und Kippen stoeren beim Gebietsplanen nur.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxZoom: 19,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  // Erst weitermachen, wenn der Kartenstil geladen ist - sonst lassen sich
  // keine Ebenen anlegen. Laedt er nicht, springt MapView auf OSM zurueck.
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Die Karte lädt nicht")), LOAD_TIMEOUT_MS);
    map.once("load", () => {
      window.clearTimeout(timer);
      resolve();
    });
    map.once("error", (event: { error?: Error }) => {
      if (map.loaded()) return;
      window.clearTimeout(timer);
      reject(event.error ?? new Error("Die Karte lädt nicht"));
    });
  }).catch((error) => {
    map.remove();
    throw error;
  });

  let destroyed = false;
  let counter = 0;
  const layers: LayerImpl[] = [];
  const handlers = new Map<string, Handler>();
  let tapHandler: ((point: LatLng) => void) | null = null;
  let popup: InstanceType<MapLibre["Popup"]> | null = null;
  let currentStyle = dark ? styles.dark : styles.light;

  /* ------------------------------ Sprechblase ----------------------------- */

  function showPopup(point: [number, number], handler: Handler) {
    popup?.remove();
    const body = document.createElement("div");
    body.className = "map-popup-body";
    const title = document.createElement("strong");
    title.textContent = handler.title ?? "";
    body.appendChild(title);
    if (handler.subtitle) {
      for (const line of handler.subtitle.split("\n")) {
        const text = document.createElement("span");
        text.textContent = line;
        body.appendChild(text);
      }
    }
    if (handler.actions?.length) {
      const row = document.createElement("div");
      row.className = "map-popup-actions";
      for (const action of handler.actions) {
        const link = document.createElement("a");
        link.href = action.href;
        link.textContent = action.label;
        link.className = action.primary ? "is-primary" : "";
        if (action.external) {
          link.target = "_blank";
          link.rel = "noreferrer";
        }
        row.appendChild(link);
      }
      body.appendChild(row);
    }
    popup = new ml.Popup({ closeButton: false, offset: 12, maxWidth: "260px", className: "map-popup" })
      .setLngLat(point)
      .setDOMContent(body)
      .addTo(map);
  }

  /* -------------------------------- Tippen -------------------------------- */

  function interactiveLayerIds(): string[] {
    return layers.flatMap((layer) => {
      return [`${layer.id}-dot`, `${layer.id}-fill`].filter((layerId) => map.getLayer(layerId));
    });
  }

  /** Das oberste antippbare Objekt unter dem Finger (mit etwas Spielraum). */
  function hit(event: MapMouseEvent): { feature: MapGeoJSONFeature; handler: Handler } | null {
    const pad = 10;
    const { x, y } = event.point;
    const found = map.queryRenderedFeatures(
      [
        [x - pad, y - pad],
        [x + pad, y + pad],
      ],
      { layers: interactiveLayerIds() },
    );
    let best: { feature: MapGeoJSONFeature; handler: Handler } | null = null;
    for (const feature of found) {
      const key = feature.properties?.key as string | undefined;
      const handler = key ? handlers.get(key) : undefined;
      if (!handler) continue;
      // Beim Zeichnen gehoeren Tipps auf blosse Flaechen der Karte.
      const clickable = handler.onClick || ((handler.title || handler.actions) && (handler.kind === "dot" || !tapHandler));
      if (!clickable) continue;
      if (handler.kind === "shape" && feature.geometry.type === "Polygon") {
        // Flaechen nur, wenn der Finger wirklich darin liegt.
        const exact = map.queryRenderedFeatures(event.point, { layers: [feature.layer.id] });
        if (!exact.some((f) => f.properties?.key === key)) continue;
      }
      if (!best || (best.handler.kind === "shape" && handler.kind === "dot")) best = { feature, handler };
    }
    return best;
  }

  map.on("click", (event) => {
    const target = hit(event);
    if (target) {
      target.handler.onClick?.();
      if (target.handler.title || target.handler.actions) {
        // Bei Punkten sitzt die Sprechblase auf dem Punkt, nicht auf dem Finger.
        const geometry = target.feature.geometry;
        const anchor: [number, number] =
          geometry.type === "Point"
            ? (geometry.coordinates as [number, number])
            : [event.lngLat.lng, event.lngLat.lat];
        showPopup(anchor, target.handler);
      }
      return;
    }
    popup?.remove();
    tapHandler?.([event.lngLat.lat, event.lngLat.lng]);
  });

  map.on("mousemove", (event) => {
    map.getCanvas().style.cursor = hit(event) ? "pointer" : "";
  });

  /* -------------------------------- Ebenen -------------------------------- */

  function layer(): MapLayer {
    const id = `d2d-${++counter}`;
    let features: GeoJSON.Feature[] = [];
    let markers: Marker[] = [];
    let keys: string[] = [];
    let scheduled = false;

    function flush() {
      scheduled = false;
      if (destroyed) return;
      const source = map.getSource(id) as GeoJSONSource | undefined;
      source?.setData({ type: "FeatureCollection", features });
    }
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(flush);
    }
    function register(handler: Handler | null): string {
      const key = `${id}:${features.length}`;
      if (handler) {
        handlers.set(key, handler);
        keys.push(key);
      }
      return key;
    }

    const impl: LayerImpl = {
      id,

      refresh() {
        impl.install();
        flush();
      },

      install() {
        if (map.getSource(id)) return;
        map.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features } });
        const polygon = ["==", ["geometry-type"], "Polygon"];
        const notPoint = ["!=", ["geometry-type"], "Point"];
        map.addLayer({
          id: `${id}-fill`,
          type: "fill",
          source: id,
          filter: polygon as never,
          paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "fillOpacity"] },
        });
        map.addLayer({
          id: `${id}-line`,
          type: "line",
          source: id,
          filter: ["all", notPoint, ["!", ["get", "dashed"]]] as never,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["get", "weight"],
            "line-offset": ["get", "offset"],
          },
        });
        map.addLayer({
          id: `${id}-dash`,
          type: "line",
          source: id,
          filter: ["all", notPoint, ["get", "dashed"]] as never,
          layout: { "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["get", "weight"],
            "line-dasharray": [3, 2.5],
          },
        });
        map.addLayer({
          id: `${id}-dot`,
          type: "circle",
          source: id,
          filter: ["==", ["geometry-type"], "Point"] as never,
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["get", "radius"],
            "circle-opacity": ["get", "opacity"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": ["get", "stroke"],
            "circle-stroke-opacity": ["get", "opacity"],
          },
        });
      },

      clear() {
        features = [];
        markers.forEach((marker) => marker.remove());
        markers = [];
        keys.forEach((key) => handlers.delete(key));
        keys = [];
        schedule();
      },

      polygon(points, options) {
        const rings = ringsOf(points).filter((ring) => ring.length >= 3);
        if (rings.length === 0) return;
        const key = register(shapeHandler(options));
        features.push({
          type: "Feature",
          properties: shapeProps(options, key, options.fillOpacity ?? 0.16),
          geometry: {
            type: "Polygon",
            coordinates: rings.map((ring, index) => closeRing(orient(ring.map(toLngLat), index === 0))),
          },
        });
        schedule();
      },

      line(points, options) {
        const key = register(null);
        features.push({
          type: "Feature",
          properties: shapeProps(options, key, 0),
          geometry: { type: "LineString", coordinates: points.map(toLngLat) },
        });
        schedule();
      },

      dot(point, options) {
        const interactive = options.onClick || options.title || options.actions;
        const key = register(
          interactive
            ? {
                kind: "dot",
                onClick: options.onClick,
                title: options.title,
                subtitle: options.subtitle,
                actions: options.actions,
              }
            : null,
        );
        features.push({
          type: "Feature",
          properties: dotProps(options, key),
          geometry: { type: "Point", coordinates: toLngLat(point) },
        });
        schedule();
      },

      marker(point, options): MarkerHandle {
        const marker = createMarker(point, options);
        markers.push(marker);
        return {
          setVisible(visible) {
            marker.getElement().style.visibility = visible ? "" : "hidden";
          },
        };
      },
    };

    layers.push(impl);
    impl.install();
    return impl;
  }

  function createMarker(point: LatLng, options: MarkerOptions): Marker {
    const element = options.element();
    element.style.zIndex = String(options.priority ?? 0);
    const marker = new ml.Marker({ element, anchor: "center", draggable: Boolean(options.draggable) })
      .setLngLat(toLngLat(point))
      .addTo(map);
    if (options.onClick || options.title) {
      element.style.cursor = "pointer";
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        options.onClick?.();
        if (options.title) {
          showPopup(toLngLat(point), { kind: "dot", title: options.title, subtitle: options.subtitle });
        }
      });
    }
    if (options.onDragEnd) {
      const onDragEnd = options.onDragEnd;
      marker.on("dragend", () => {
        const p = marker.getLngLat();
        onDragEnd([p.lat, p.lng]);
      });
    }
    return marker;
  }

  // Ein neuer Kartenstil (hell/dunkel) verwirft alle eigenen Ebenen -
  // danach werden sie in derselben Reihenfolge wieder angelegt.
  map.on("style.load", () => {
    if (!destroyed) layers.forEach((l) => l.refresh());
  });

  function setView(center: LatLng, zoom: number, animate = true) {
    const target = { center: toLngLat(center), zoom: zoom - ZOOM_OFFSET };
    if (animate) map.flyTo({ ...target, duration: 700, essential: true });
    else map.jumpTo(target);
  }

  return {
    provider: "openfreemap",
    canSwitchType: false,
    layer,
    setView,
    fit(points, options = {}) {
      if (points.length === 0) return;
      let south = 90;
      let north = -90;
      let west = 180;
      let east = -180;
      for (const [lat, lng] of points) {
        south = Math.min(south, lat);
        north = Math.max(north, lat);
        west = Math.min(west, lng);
        east = Math.max(east, lng);
      }
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        {
          padding: options.padding ?? 28,
          maxZoom: (options.maxZoom ?? 17) - ZOOM_OFFSET,
          animate: options.animate ?? false,
          duration: 600,
        },
      );
    },
    zoom: () => map.getZoom() + ZOOM_OFFSET,
    zoomBy: (delta) => map.easeTo({ zoom: map.getZoom() + delta, duration: 250 }),
    onTap(handler) {
      tapHandler = handler;
    },
    project(point) {
      const { x, y } = map.project(toLngLat(point));
      return [x, y];
    },
    onViewChange(handler) {
      map.on("moveend", handler);
      return () => {
        if (!destroyed) map.off("moveend", handler);
      };
    },
    setMapType() {
      // OpenFreeMap hat keine Satellitenbilder.
    },
    setDark(isDark) {
      const next = isDark ? styles.dark : styles.light;
      if (next === currentStyle) return;
      currentStyle = next;
      map.setStyle(next);
    },
    resize: () => map.resize(),
    destroy() {
      destroyed = true;
      popup?.remove();
      map.remove();
    },
  };
}

/* ------------------------------- Hilfen -------------------------------- */

function toLngLat([lat, lng]: LatLng): [number, number] {
  return [lng, lat];
}

/**
 * Aussenringe gegen den Uhrzeigersinn, Loecher mit ihm (wie GeoJSON es will).
 * Erst dann zeigt ein positiver line-offset verlaesslich ins Innere.
 */
function orient(ring: [number, number][], outer: boolean): [number, number][] {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  const counterClockwise = sum > 0;
  return counterClockwise === outer ? ring : [...ring].reverse();
}

function closeRing(ring: [number, number][]): [number, number][] {
  if (ring.length === 0) return ring;
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

function shapeHandler(options: ShapeOptions): Handler | null {
  if (!options.onClick && !options.title) return null;
  return { kind: "shape", onClick: options.onClick, title: options.title, subtitle: options.subtitle };
}

function shapeProps(options: ShapeOptions, key: string, fillOpacity: number) {
  const weight = options.weight ?? 2;
  return {
    key,
    color: options.color,
    weight,
    fillOpacity,
    dashed: Boolean(options.dashed),
    offset: options.inset ? weight / 2 : 0,
  };
}

function dotProps(options: DotOptions, key: string) {
  return {
    key,
    color: options.color,
    radius: options.radius,
    opacity: options.opacity ?? 0.95,
    stroke: options.ring ? 1.5 : 0,
  };
}
