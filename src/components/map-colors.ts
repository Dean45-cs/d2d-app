/**
 * Leaflet braucht echte Farbwerte, die Marken-Farben stehen aber als
 * CSS-Variablen in brand.css. Diese Bruecke liest sie zur Laufzeit aus - so
 * bleiben Karte und Oberflaeche auch nach einem Farbwechsel einheitlich.
 */
export function cssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}
