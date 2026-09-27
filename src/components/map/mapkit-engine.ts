import type {
  DotOptions,
  LatLng,
  MapEngine,
  MapLayer,
  MapStart,
  MarkerHandle,
  MarkerOptions,
  ShapeOptions,
} from "./types";
import { ringsOf } from "./types";

/*
 * Apple Karten ueber MapKit JS.
 *
 * MapKit kennt keine Zoomstufen, sondern Ausschnitte (Mittelpunkt + Spanne in
 * Grad). Damit die Seiten wie gewohnt mit "Zoom 15" arbeiten koennen, rechnet
 * die Engine zwischen beiden um - auf Basis der Kachelkarten-Formel
 * (360 Grad Laenge = 256 Pixel * 2^Zoom).
 */

const MAPKIT_SRC = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js";
const LOAD_TIMEOUT_MS = 15_000;

/* MapKit JS bringt keine Typen mit; die paar genutzten Teile bleiben lose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapKit = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MkObject = any;

declare global {
  interface Window {
    mapkit?: MapKit;
    __d2dMapKitLoaded?: () => void;
  }
}

let loading: Promise<MapKit> | null = null;
let failure: string | null = null;
const failureListeners = new Set<(message: string) => void>();

function fail(message: string) {
  if (failure) return;
  failure = message;
  console.warn("[karte]", message);
  failureListeners.forEach((listener) => listener(message));
}

/** Ist Apple Karten in dieser Sitzung schon gescheitert? */
export function mapKitFailure(): string | null {
  return failure;
}

/** Meldet, wenn Apple Karten ausfaellt (z. B. Token abgelehnt). */
export function onMapKitFailure(listener: (message: string) => void): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

/** Laedt MapKit JS einmal pro Seite und meldet es mit dem Token des Servers an. */
export function loadMapKit(): Promise<MapKit> {
  if (failure) return Promise.reject(new Error(failure));
  if (loading) return loading;

  loading = new Promise<MapKit>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      fail("Apple Karten lädt nicht");
      reject(new Error("Apple Karten lädt nicht"));
    }, LOAD_TIMEOUT_MS);

    window.__d2dMapKitLoaded = () => {
      window.clearTimeout(timer);
      const mapkit = window.mapkit;
      if (!mapkit) {
        fail("Apple Karten fehlt");
        reject(new Error("Apple Karten fehlt"));
        return;
      }
      mapkit.addEventListener("error", (event: { status?: string }) => {
        fail(
          event.status === "Unauthorized"
            ? "Apple Karten hat das Token abgelehnt"
            : `Apple Karten meldet einen Fehler (${event.status ?? "unbekannt"})`,
        );
      });
      mapkit.init({
        language: "de",
        authorizationCallback: (done: (token: string) => void) => {
          fetch("/api/map/token", { cache: "no-store", credentials: "same-origin" })
            .then((response) =>
              response.ok ? response.text() : Promise.reject(new Error(String(response.status))),
            )
            .then(done)
            .catch(() => fail("Kein Token für Apple Karten"));
        },
      });
      resolve(mapkit);
    };

    const script = document.createElement("script");
    script.src = MAPKIT_SRC;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.dataset.callback = "__d2dMapKitLoaded";
    script.dataset.libraries = "map,annotations,overlays";
    script.onerror = () => {
      window.clearTimeout(timer);
      fail("Apple Karten ist nicht erreichbar");
      reject(new Error("Apple Karten ist nicht erreichbar"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/* ------------------------------ Umrechnung ------------------------------ */

function size(element: HTMLElement): { w: number; h: number } {
  return { w: element.clientWidth || 400, h: element.clientHeight || 300 };
}

function spanForZoom(element: HTMLElement, lat: number, zoom: number) {
  const { w, h } = size(element);
  const lngDelta = (360 * w) / (256 * 2 ** zoom);
  const latDelta = lngDelta * (h / w) * Math.cos((lat * Math.PI) / 180);
  return { latDelta, lngDelta };
}

/* -------------------------------- Engine -------------------------------- */

export function createMapKitEngine(
  mapkit: MapKit,
  element: HTMLElement,
  start: MapStart,
  dark: boolean,
): MapEngine {
  const MapTypes = mapkit.Map.MapTypes;
  const map: MkObject = new mapkit.Map(element, {
    // Gedaempfte Apple-Karte: Gebiete und Punkte stehen darauf klar im Vordergrund.
    mapType: MapTypes.MutedStandard ?? MapTypes.Standard,
    colorScheme: dark ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light,
    showsCompass: mapkit.FeatureVisibility.Hidden,
    showsScale: mapkit.FeatureVisibility.Adaptive,
    showsZoomControl: false,
    showsMapTypeControl: false,
    showsUserLocationControl: false,
    isRotationEnabled: false,
  });
  if (mapkit.PointOfInterestFilter) {
    // Geschaefte und Restaurants lenken beim Gebietsplanen nur ab.
    map.pointOfInterestFilter = mapkit.PointOfInterestFilter.excludingAllCategories;
  } else {
    map.showsPointsOfInterest = false;
  }

  const coordinate = ([lat, lng]: LatLng) => new mapkit.Coordinate(lat, lng);
  // Seiten raeumen ihre Ebenen manchmal erst nach dem Abbau der Karte auf.
  let destroyed = false;

  function region(center: LatLng, latDelta: number, lngDelta: number) {
    return new mapkit.CoordinateRegion(
      coordinate(center),
      new mapkit.CoordinateSpan(Math.min(latDelta, 170), Math.min(lngDelta, 359)),
    );
  }

  function currentZoom(): number {
    const lngDelta = map.region?.span?.longitudeDelta;
    if (!lngDelta) return start.zoom;
    return Math.log2((360 * size(element).w) / (256 * lngDelta));
  }

  function setView(center: LatLng, zoom: number, animate = true) {
    const { latDelta, lngDelta } = spanForZoom(element, center[0], zoom);
    map.setRegionAnimated(region(center, latDelta, lngDelta), animate);
  }

  setView(start.center, start.zoom, false);

  /* Punkte bleiben beim Zoomen gleich gross: Kreise in MapKit haben einen
     Radius in Metern, der nach jeder Bewegung nachgerechnet wird. */
  const circles = new Set<{ overlay: MkObject; px: number }>();
  function metersPerPixel(): number {
    const latDelta = map.region?.span?.latitudeDelta ?? 0.01;
    return (latDelta * 111_320) / size(element).h;
  }
  map.addEventListener("region-change-end", () => {
    const mpp = metersPerPixel();
    circles.forEach((circle) => {
      circle.overlay.radius = circle.px * mpp;
    });
  });

  /* Antippen: Flaechen und Marker melden sich ueber ihre data.onClick. */
  map.addEventListener("select", (event: { overlay?: MkObject; annotation?: MkObject }) => {
    const target = event.overlay ?? event.annotation;
    const onClick = target?.data?.onClick as (() => void) | undefined;
    if (!onClick) return;
    onClick();
    // Flaechen sofort wieder abwaehlen, damit ein zweiter Tipp wieder zaehlt.
    if (event.overlay) {
      window.setTimeout(() => {
        if (map.selectedOverlay === event.overlay) map.selectedOverlay = null;
      }, 0);
    }
  });

  let tapHandler: ((point: LatLng) => void) | null = null;
  map.addEventListener("single-tap", (event: { pointOnPage: DOMPoint }) => {
    if (!tapHandler) return;
    const c = map.convertPointOnPageToCoordinate(event.pointOnPage);
    tapHandler([c.latitude, c.longitude]);
  });

  function style(options: ShapeOptions, filled: boolean) {
    return new mapkit.Style({
      strokeColor: options.color,
      strokeOpacity: 1,
      lineWidth: options.weight ?? 2,
      lineDash: options.dashed ? [6, 5] : [],
      lineJoin: "round",
      lineCap: "round",
      fillColor: filled ? options.color : undefined,
      fillOpacity: filled ? (options.fillOpacity ?? 0.16) : 0,
    });
  }

  function annotation(
    point: LatLng,
    build: () => HTMLElement,
    h: number,
    extra: Pick<MarkerOptions, "title" | "subtitle" | "onClick" | "draggable" | "onDragEnd">,
  ) {
    const item = new mapkit.Annotation(coordinate(point), build, {
      title: extra.title ?? "",
      subtitle: extra.subtitle ?? "",
      calloutEnabled: Boolean(extra.title),
      // Der Marker sitzt mittig auf dem Punkt statt mit der Unterkante.
      anchorOffset: new DOMPoint(0, h / 2),
      draggable: Boolean(extra.draggable),
      enabled: Boolean(extra.onClick || extra.title || extra.draggable),
      data: { onClick: extra.onClick },
    });
    if (extra.onDragEnd) {
      const onDragEnd = extra.onDragEnd;
      item.addEventListener("drag-end", () => {
        onDragEnd([item.coordinate.latitude, item.coordinate.longitude]);
      });
    }
    return item;
  }

  function layer(): MapLayer {
    const overlays: MkObject[] = [];
    const annotations: MkObject[] = [];
    const ownCircles: Array<{ overlay: MkObject; px: number }> = [];
    let pendingOverlays: MkObject[] = [];
    let pendingAnnotations: MkObject[] = [];
    let scheduled = false;

    // Tausende Punkte auf einmal: gesammelt in einem Rutsch an die Karte.
    function flush() {
      scheduled = false;
      if (destroyed) return;
      if (pendingOverlays.length) map.addOverlays(pendingOverlays);
      if (pendingAnnotations.length) map.addAnnotations(pendingAnnotations);
      pendingOverlays = [];
      pendingAnnotations = [];
    }
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(flush);
    }
    function addOverlay(item: MkObject) {
      overlays.push(item);
      pendingOverlays.push(item);
      schedule();
    }
    function addAnnotation(item: MkObject) {
      annotations.push(item);
      pendingAnnotations.push(item);
      schedule();
    }

    return {
      clear() {
        if (destroyed) return;
        const addedOverlays = overlays.filter((o) => !pendingOverlays.includes(o));
        const addedAnnotations = annotations.filter((a) => !pendingAnnotations.includes(a));
        if (addedOverlays.length) map.removeOverlays(addedOverlays);
        if (addedAnnotations.length) map.removeAnnotations(addedAnnotations);
        overlays.length = 0;
        annotations.length = 0;
        pendingOverlays = [];
        pendingAnnotations = [];
        ownCircles.forEach((circle) => circles.delete(circle));
        ownCircles.length = 0;
      },

      polygon(points, options) {
        const rings = ringsOf(points).filter((ring) => ring.length >= 3);
        if (rings.length === 0) return;
        // Mehrere Ringe: MapKit fuellt nach der Gerade-Ungerade-Regel, Loecher bleiben frei.
        const item = new mapkit.PolygonOverlay(rings.map((ring) => ring.map(coordinate)), {
          style: style(options, true),
          enabled: Boolean(options.onClick),
          data: { onClick: options.onClick },
        });
        addOverlay(item);
      },

      line(points, options) {
        addOverlay(
          new mapkit.PolylineOverlay(points.map(coordinate), {
            style: style(options, false),
            enabled: false,
          }),
        );
      },

      dot(point, options) {
        // Mit Beschriftung oder Tipp-Aktion wird der Punkt ein echter Marker
        // mit Apple-Sprechblase; sonst ein leichter Kreis (fuer Tausende).
        if (options.title || options.onClick) {
          const d = options.radius * 2 + (options.ring ? 3 : 0);
          addAnnotation(annotation(point, () => dotElement(options), d, options));
          return;
        }
        const circle = {
          overlay: new mapkit.CircleOverlay(coordinate(point), options.radius * metersPerPixel(), {
            style: new mapkit.Style({
              lineWidth: options.ring ? 1.5 : 0,
              strokeColor: "#ffffff",
              strokeOpacity: options.ring ? 1 : 0,
              fillColor: options.color,
              fillOpacity: options.opacity ?? 0.95,
            }),
            enabled: false,
          }),
          px: options.radius,
        };
        circles.add(circle);
        ownCircles.push(circle);
        addOverlay(circle.overlay);
      },

      marker(point, options): MarkerHandle {
        const item = annotation(point, options.element, options.size[1], options);
        addAnnotation(item);
        return {
          setVisible(visible) {
            item.visible = visible;
          },
        };
      },
    };
  }

  return {
    provider: "apple",
    canSwitchType: true,
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
      const { w, h } = size(element);
      const padding = options.padding ?? 24;
      // Rand in Pixeln als Aufschlag auf die Spanne.
      const growLat = h / Math.max(h - 2 * padding, h * 0.5);
      const growLng = w / Math.max(w - 2 * padding, w * 0.5);
      const center: LatLng = [(south + north) / 2, (west + east) / 2];
      const min = spanForZoom(element, center[0], options.maxZoom ?? 17);
      map.setRegionAnimated(
        region(
          center,
          Math.max((north - south) * growLat, min.latDelta),
          Math.max((east - west) * growLng, min.lngDelta),
        ),
        options.animate ?? false,
      );
    },
    zoom: currentZoom,
    zoomBy(delta) {
      const c = map.center;
      setView([c.latitude, c.longitude], currentZoom() + delta, true);
    },
    onTap(handler) {
      tapHandler = handler;
    },
    project([lat, lng]) {
      const point = map.convertCoordinateToPointOnPage(new mapkit.Coordinate(lat, lng));
      return [point.x, point.y];
    },
    onViewChange(handler) {
      map.addEventListener("region-change-end", handler);
      return () => {
        if (!destroyed) map.removeEventListener("region-change-end", handler);
      };
    },
    setMapType(type) {
      map.mapType = type === "hybrid" ? MapTypes.Hybrid : (MapTypes.MutedStandard ?? MapTypes.Standard);
    },
    setDark(isDark) {
      map.colorScheme = isDark ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light;
    },
    resize() {
      // MapKit beobachtet die Groesse selbst.
    },
    destroy() {
      destroyed = true;
      circles.clear();
      map.destroy();
    },
  };
}

/** Runder Punkt mit weissem Rand, wie die Pins in Apple Karten. */
function dotElement(options: DotOptions): HTMLElement {
  const d = options.radius * 2;
  const el = document.createElement("span");
  el.style.cssText =
    `display:block;width:${d}px;height:${d}px;border-radius:999px;` +
    `background:${options.color};opacity:${options.opacity ?? 0.95};` +
    (options.ring ? "border:1.5px solid #fff;box-shadow:0 1px 3px rgb(15 23 42 / .35);" : "");
  return el;
}
