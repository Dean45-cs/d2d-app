/*
 * Farbrechnung fuer die Themen der App - ohne DOM, laeuft auf dem Server,
 * im Browser und in den Tests.
 *
 * Gerechnet wird in OKLCH (Helligkeit, Buntheit, Farbton): dort bleibt eine
 * Farbe gleich hell, wenn sich ihr Ton dreht. So laesst sich das Gruen der
 * Marke in jede andere Farbe uebertragen, ohne dass Flaechen, Schrift und
 * Linien ihr Gewicht verlieren. Kontraste nach WCAG 2.x.
 */

export type Rgb = [number, number, number];

export interface Oklch {
  /** Helligkeit 0…1 */
  l: number;
  /** Buntheit, praktisch 0…0.37 */
  c: number;
  /** Farbton in Grad */
  h: number;
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((char) => char + char).join("") : value;
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16)) as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((part) => Math.round(Math.min(255, Math.max(0, part))).toString(16).padStart(2, "0")).join("")}`;
}

const toLinear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (channel: number) => {
  const c = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return c * 255;
};

/** OKLCH aus einer sRGB-Farbe (Bjoern Ottosson, "A perceptual color space"). */
export function rgbToOklch(rgb: Rgb): Oklch {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  const h = c < 1e-6 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** Lineares sRGB (ohne Begrenzung) - ausserhalb von 0…1 liegt die Farbe nicht im Bildschirmumfang. */
function oklchToLinear({ l: L, c, h }: Oklch): Rgb {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function inGamut(color: Oklch): boolean {
  return oklchToLinear(color).every((channel) => channel >= -0.0005 && channel <= 1.0005);
}

/** Die buntere Farbe, die der Bildschirm bei dieser Helligkeit und diesem Ton noch zeigen kann. */
export function fitGamut(color: Oklch): Oklch {
  if (inGamut(color)) return color;
  let low = 0;
  let high = color.c;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    if (inGamut({ ...color, c: mid })) low = mid;
    else high = mid;
  }
  return { ...color, c: low };
}

export function oklchToRgb(color: Oklch): Rgb {
  return oklchToLinear(fitGamut(color)).map((channel) => fromLinear(Math.min(1, Math.max(0, channel)))) as Rgb;
}

export function oklchToHex(color: Oklch): string {
  return rgbToHex(oklchToRgb(color));
}

export function hexToOklch(hex: string): Oklch {
  return rgbToOklch(hexToRgb(hex));
}

/** Relative Leuchtdichte nach WCAG. */
export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => toLinear(Math.round(channel)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string | Rgb, b: string | Rgb): number {
  const one = luminance(typeof a === "string" ? hexToRgb(a) : a);
  const two = luminance(typeof b === "string" ? hexToRgb(b) : b);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

/** Eine Farbe mit Deckkraft auf einem Grund - wie color-mix(... x%, transparent) ueber einer Flaeche. */
export function over(top: string, alpha: number, ground: string): Rgb {
  const fg = hexToRgb(top);
  const bg = hexToRgb(ground);
  return fg.map((channel, index) => channel * alpha + bg[index] * (1 - alpha)) as Rgb;
}

/** "rgb(12 34 56)" ohne Deckkraft - fuer Tokens, die ihre Deckkraft selbst mitbringen. */
export function rgbTriplet(hex: string): string {
  return hexToRgb(hex).join(" ");
}
