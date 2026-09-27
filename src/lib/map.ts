/**
 * Welche Karte die App zeigt.
 *
 *  - OpenFreeMap (Standard): moderne Vektorkarte, kostenlos, ohne Konto und
 *    ohne Limit. Laeuft ueber MapLibre GL.
 *  - Apple Karten (MapKit JS): sobald Zugangsdaten aus dem Apple-Developer-
 *    Konto hinterlegt sind (Token oder Team-ID + Schluessel-ID + privater
 *    Schluessel, siehe src/lib/mapkit-token.ts).
 *  - OpenStreetMap-Kacheln (Leaflet): Rueckfall, wenn das Geraet keine
 *    Vektorkarten kann oder die anderen Dienste nicht erreichbar sind.
 */

export type MapProvider = "apple" | "openfreemap" | "osm";

export interface MapConfig {
  provider: MapProvider;
  /** Kacheln fuer den OpenStreetMap-Rueckfall. */
  tileUrl: string;
  /** Kartenstile fuer OpenFreeMap (hell/dunkel). */
  styles: { light: string; dark: string };
}

/** Kartenstile von OpenFreeMap; eigene per NEXT_PUBLIC_MAP_STYLE_URL(_DARK). */
export function mapStyles(): { light: string; dark: string } {
  return {
    light:
      process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty",
    dark:
      process.env.NEXT_PUBLIC_MAP_STYLE_URL_DARK || "https://tiles.openfreemap.org/styles/dark",
  };
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
  let provider: MapProvider = appleMapsConfigured() ? "apple" : "openfreemap";
  if (forced === "osm" || forced === "openfreemap") provider = forced;
  if (forced === "apple" && appleMapsConfigured()) provider = "apple";
  return { provider, tileUrl: mapTileUrl(), styles: mapStyles() };
}

/**
 * Navigation zu einem Punkt in Apple Karten. Auf iPhone und iPad oeffnet der
 * Link direkt die Karten-App, am Rechner die Web-Version von Apple Karten.
 */
export function routeUrl(lat: number, lng: number, mode?: "walk" | "drive"): string {
  const flag = mode === "walk" ? "&dirflg=w" : mode === "drive" ? "&dirflg=d" : "";
  return `https://maps.apple.com/?daddr=${lat},${lng}${flag}`;
}
