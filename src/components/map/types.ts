/**
 * Gemeinsame Sprache aller Karten der App.
 *
 * Die Seiten zeichnen nur ueber diese Schnittstelle - ob darunter Apple
 * Karten (MapKit JS) oder der OpenStreetMap-Rueckfall (Leaflet) laeuft,
 * entscheidet MapView. So sehen Gebiete, Punkte und Nummernschilder auf
 * beiden gleich aus.
 */

export type LatLng = [number, number];
export type MapProvider = "apple" | "openfreemap" | "osm";

/** "standard" = Karte, "hybrid" = Satellit mit Strassennamen */
export type MapType = "standard" | "hybrid";

/** Knopf in der Sprechblase, z. B. "Hier klingeln" oder "Route". */
export interface MapAction {
  label: string;
  href: string;
  primary?: boolean;
  /** In neuem Fenster / in der Karten-App oeffnen */
  external?: boolean;
}

/** Ein einfacher Ring oder Aussenring samt Loechern ([aussen, loch, loch, ...]). */
export type PolygonPoints = LatLng[] | LatLng[][];

/** Macht aus beiden Schreibweisen eine Liste von Ringen. */
export function ringsOf(points: PolygonPoints): LatLng[][] {
  if (points.length === 0) return [];
  return typeof points[0][0] === "number" ? [points as LatLng[]] : (points as LatLng[][]);
}

export interface ShapeOptions {
  color: string;
  /** Linienbreite in Pixeln */
  weight?: number;
  fillOpacity?: number;
  dashed?: boolean;
  /**
   * Rand ganz nach innen legen. Stossen zwei Gebiete aneinander, liegen ihre
   * Raender dann nebeneinander statt uebereinander (nur OpenFreeMap).
   */
  inset?: boolean;
  /** Tipp auf die Flaeche */
  onClick?: () => void;
  /** Sprechblase (nur OSM; bei Apple uebernimmt das ein Schild in der Flaeche) */
  title?: string;
  subtitle?: string;
}

export interface DotOptions {
  color: string;
  /** Radius in Pixeln - bleibt beim Zoomen gleich gross */
  radius: number;
  opacity?: number;
  /** Weisser Rand wie bei Apple-Karten-Pins */
  ring?: boolean;
  title?: string;
  subtitle?: string;
  /** Knoepfe in der Sprechblase (nicht bei Apple Karten) */
  actions?: MapAction[];
  onClick?: () => void;
}

export interface MarkerOptions {
  /** Baut das Element des Markers. Wird je Karte einmal aufgerufen. */
  element: () => HTMLElement;
  /** Groesse in Pixeln; der Marker sitzt mittig auf dem Punkt. */
  size: [number, number];
  title?: string;
  subtitle?: string;
  onClick?: () => void;
  draggable?: boolean;
  onDragEnd?: (point: LatLng) => void;
  /** Hoeher = weiter oben */
  priority?: number;
}

export interface MarkerHandle {
  /** Ein- und ausblenden, ohne den Marker neu zu bauen (z. B. wenn Schilder sich decken). */
  setVisible(visible: boolean): void;
}

export interface MapLayer {
  clear(): void;
  polygon(points: PolygonPoints, options: ShapeOptions): void;
  line(points: LatLng[], options: ShapeOptions): void;
  dot(point: LatLng, options: DotOptions): void;
  marker(point: LatLng, options: MarkerOptions): MarkerHandle;
}

export interface FitOptions {
  maxZoom?: number;
  /** Rand in Pixeln */
  padding?: number;
  animate?: boolean;
}

export interface MapEngine {
  readonly provider: MapProvider;
  /** Laesst sich zwischen Karte und Satellit umschalten? */
  readonly canSwitchType: boolean;
  /** Eine neue, leere Ebene. Spaeter angelegte Ebenen liegen oben. */
  layer(): MapLayer;
  setView(center: LatLng, zoom: number, animate?: boolean): void;
  fit(points: LatLng[], options?: FitOptions): void;
  /** Zoomstufe im Sinne der Kachelkarten (6 = Deutschland, 16 = Strasse) */
  zoom(): number;
  zoomBy(delta: number): void;
  /** Tipp auf eine freie Stelle der Karte */
  onTap(handler: ((point: LatLng) => void) | null): void;
  /**
   * Bildschirmposition eines Punkts in Pixeln. Der Nullpunkt ist je Anbieter
   * verschieden - taugt also fuer Abstaende, nicht fuer absolute Lagen.
   */
  project(point: LatLng): [number, number];
  /** Meldet das Ende jeder Bewegung (Zoomen, Schieben). Liefert die Abmeldung. */
  onViewChange(handler: () => void): () => void;
  setMapType(type: MapType): void;
  setDark(dark: boolean): void;
  resize(): void;
  destroy(): void;
}

export interface MapStart {
  center: LatLng;
  zoom: number;
}

export const GERMANY: MapStart = { center: [51.2, 10.4], zoom: 6 };
