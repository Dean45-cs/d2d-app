/** Kachel-Dienst der Karten. Fuer den Dauerbetrieb einen eigenen eintragen. */
export function mapTileUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MAP_TILE_URL ??
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
  );
}
