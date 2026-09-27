/**
 * Welche Karte die App zeigt.
 *
 * Standard ist Apple Karten (MapKit JS). Dafuer braucht es Zugangsdaten aus
 * dem Apple-Developer-Konto - entweder ein fertiges Token oder Team-ID,
 * Schluessel-ID und privaten Schluessel (dann stellt der Server kurzlebige
 * Tokens selbst aus, siehe src/lib/mapkit-token.ts). Fehlen sie, zeigt die
 * App dieselben Karten mit OpenStreetMap-Kacheln, damit nichts leer bleibt.
 */

export type MapProvider = "apple" | "osm";

export interface MapConfig {
  provider: MapProvider;
  /** Kacheln fuer den OpenStreetMap-Rueckfall. */
  tileUrl: string;
}

/** Kachel-Dienst fuer den Rueckfall. Fuer den Dauerbetrieb einen eigenen eintragen. */
export function mapTileUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
  );
}

export function appleMapsConfigured(): boolean {
  return Boolean(
    process.env.APPLE_MAPKIT_TOKEN ||
      (process.env.APPLE_MAPKIT_TEAM_ID &&
        process.env.APPLE_MAPKIT_KEY_ID &&
        process.env.APPLE_MAPKIT_PRIVATE_KEY),
  );
}

export function mapConfig(): MapConfig {
  const forced = (process.env.MAP_PROVIDER ?? "").toLowerCase();
  const provider: MapProvider =
    forced === "osm" || !appleMapsConfigured() ? "osm" : "apple";
  return { provider, tileUrl: mapTileUrl() };
}

/**
 * Navigation zu einem Punkt in Apple Karten. Auf iPhone und iPad oeffnet der
 * Link direkt die Karten-App, am Rechner die Web-Version von Apple Karten.
 */
export function routeUrl(lat: number, lng: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lng}`;
}
