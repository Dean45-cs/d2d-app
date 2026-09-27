import type { LatLng, MapEngine, MapLayer, MapStart } from "./types";

/**
 * Rueckfall auf OpenStreetMap-Kacheln (Leaflet), solange Apple Karten nicht
 * eingerichtet oder nicht erreichbar ist.
 */
export type Leaflet = typeof import("leaflet");

export function loadLeaflet(): Promise<Leaflet> {
  return import("leaflet");
}

export function createLeafletEngine(
  L: Leaflet,
  element: HTMLElement,
  start: MapStart,
  tileUrl: string,
): MapEngine {

  const map = L.map(element, {
    center: start.center,
    zoom: start.zoom,
    zoomControl: false,
    // Tausende Adresspunkte zeichnet die Leinwand deutlich fluessiger als SVG.
    preferCanvas: true,
  });
  L.tileLayer(tileUrl, {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap-Mitwirkende",
  }).addTo(map);

  let tapHandler: ((point: LatLng) => void) | null = null;
  map.on("click", (event: { latlng: { lat: number; lng: number } }) => {
    tapHandler?.([event.latlng.lat, event.latlng.lng]);
  });

  function tooltip(title?: string, subtitle?: string): string | null {
    if (!title) return null;
    return subtitle
      ? `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(subtitle)}`
      : `<strong>${escapeHtml(title)}</strong>`;
  }

  function layer(): MapLayer {
    const group = L.layerGroup().addTo(map);
    return {
      clear: () => group.clearLayers(),

      polygon(points, options) {
        const shape = L.polygon(points, {
          color: options.color,
          weight: options.weight ?? 2,
          fillOpacity: options.fillOpacity ?? 0.16,
          dashArray: options.dashed ? "6 5" : undefined,
          interactive: Boolean(options.onClick || options.title),
          // Ohne eigenen Klick geht der Tipp an die Karte (Zeichnen darueber).
          bubblingMouseEvents: !options.onClick,
        });
        const text = tooltip(options.title, options.subtitle);
        if (text) shape.bindTooltip(text, { direction: "top", sticky: true });
        shape.addTo(group);
        if (options.onClick) {
          shape.on("click", options.onClick);
          shape.getElement?.()?.setAttribute("role", "button");
        }
      },

      line(points, options) {
        L.polyline(points, {
          color: options.color,
          weight: options.weight ?? 2,
          dashArray: options.dashed ? "6 5" : undefined,
          interactive: false,
        }).addTo(group);
      },

      dot(point, options) {
        const interactive = Boolean(options.onClick || options.title);
        const dot = L.circleMarker(point, {
          radius: options.radius,
          stroke: Boolean(options.ring),
          color: "#ffffff",
          weight: 1.5,
          fillColor: options.color,
          fillOpacity: options.opacity ?? 0.95,
          interactive,
          bubblingMouseEvents: !options.onClick,
        });
        const text = tooltip(options.title, options.subtitle);
        if (text) dot.bindTooltip(text, { direction: "top" });
        if (options.onClick) dot.on("click", options.onClick);
        dot.addTo(group);
      },

      marker(point, options) {
        const [w, h] = options.size;
        const marker = L.marker(point, {
          icon: L.divIcon({
            className: "",
            iconSize: [w, h],
            iconAnchor: [w / 2, h / 2],
            html: options.element(),
          }),
          draggable: Boolean(options.draggable),
          interactive: Boolean(options.onClick || options.draggable || options.title),
          keyboard: false,
          zIndexOffset: (options.priority ?? 0) * 100,
        });
        const text = tooltip(options.title, options.subtitle);
        if (text) marker.bindTooltip(text, { direction: "top", offset: [0, -h / 2] });
        if (options.onClick) marker.on("click", options.onClick);
        if (options.onDragEnd) {
          const onDragEnd = options.onDragEnd;
          marker.on("dragend", () => {
            const p = marker.getLatLng();
            onDragEnd([p.lat, p.lng]);
          });
        }
        marker.addTo(group);
      },
    };
  }

  return {
    provider: "osm",
    canSwitchType: false,
    layer,
    setView(center, zoom, animate = true) {
      if (animate) map.flyTo(center, zoom, { duration: 0.6 });
      else map.setView(center, zoom, { animate: false });
    },
    fit(points, options = {}) {
      if (points.length === 0) return;
      const padding = options.padding ?? 24;
      map.fitBounds(L.latLngBounds(points), {
        padding: [padding, padding],
        maxZoom: options.maxZoom ?? 17,
        animate: options.animate ?? false,
      });
    },
    zoom: () => map.getZoom(),
    zoomBy: (delta) => map.setZoom(map.getZoom() + delta),
    onTap(handler) {
      tapHandler = handler;
    },
    setMapType() {
      // Ohne eigenen Satelliten-Dienst gibt es nur die Kartenansicht.
    },
    setDark() {
      // Der Dunkelmodus daempft die Kacheln per CSS (globals.css).
    },
    resize: () => map.invalidateSize(),
    destroy() {
      // Laufende Flug-/Zoom-Animation zuerst stoppen.
      map.stop();
      map.remove();
    },
  };
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}
