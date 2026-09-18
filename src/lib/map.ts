/** Kachel-Dienst der Karten. Fuer den Dauerbetrieb einen eigenen eintragen. */
export function mapTileUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MAP_TILE_URL ??
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
  );
}

/**
 * Navigation zu einer Strasse. Der universelle Google-Maps-Link oeffnet auf
 * dem Handy die Karten-App und am Rechner den Browser - ohne dass die App
 * wissen muss, welches Geraet gerade davorsitzt.
 */
export function routeUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
