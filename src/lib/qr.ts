import { encode } from "uqr";

/** Ruhezone um den Code in Modulen - so viel verlangt die Norm, damit Kameras den Rand finden. */
export const QR_QUIET_ZONE = 4;

/**
 * QR-Code als ein einziger SVG-Pfad: je Zeile die dunklen Strecken als
 * Rechtecke. Fehlerkorrektur "M" (15 %) - der Code bleibt lesbar, auch wenn
 * ein Finger oder eine Spiegelung auf dem Display einen Teil verdeckt, und
 * ist fuer einen Link noch klein genug, um aus der Hand zu scannen.
 */
export function qrPath(text: string): { size: number; path: string } {
  const { size, data } = encode(text, { ecc: "M", border: 0 });
  const parts: string[] = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y][x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < size && data[y][x]) x++;
      parts.push(`M${start + QR_QUIET_ZONE} ${y + QR_QUIET_ZONE}h${x - start}v1h-${x - start}z`);
    }
  }
  return { size: size + QR_QUIET_ZONE * 2, path: parts.join("") };
}
