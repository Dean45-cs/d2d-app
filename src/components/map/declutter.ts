import type { LatLng, MapEngine, MarkerHandle } from "./types";

export interface Placeable {
  point: LatLng;
  /** Breite und Hoehe in Pixeln */
  size: [number, number];
  /** Hoeher gewinnt, wenn sich zwei Marker decken. */
  rank: number;
  handle: MarkerHandle;
}

/**
 * Blendet Marker aus, die sich beim aktuellen Zoom decken wuerden - wie die
 * Beschriftungen einer Karte. Beim Hineinzoomen tauchen sie wieder auf.
 * Liefert die Abmeldung.
 */
export function declutter(engine: MapEngine, items: Placeable[], gap = 4): () => void {
  if (items.length < 2) return () => {};
  const order = [...items].sort((a, b) => b.rank - a.rank);
  const run = () => {
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (const item of order) {
      const [x, y] = engine.project(item.point);
      const [w, h] = item.size;
      const free = placed.every(
        (other) =>
          Math.abs(other.x - x) >= (other.w + w) / 2 + gap ||
          Math.abs(other.y - y) >= (other.h + h) / 2 + gap,
      );
      item.handle.setVisible(free);
      if (free) placed.push({ x, y, w, h });
    }
  };
  const stop = engine.onViewChange(run);
  run();
  return stop;
}
