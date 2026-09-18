/**
 * Leaflet braucht echte Farbwerte, die Marken-Farben stehen aber als
 * CSS-Variablen in brand.css. Diese Bruecke liest sie zur Laufzeit aus - so
 * bleiben Karte und Oberflaeche auch nach einem Farbwechsel einheitlich und
 * der Dunkelmodus stimmt automatisch.
 */
export function cssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

import { MAX_PLOTS } from "@/lib/geo/split";

const PLOT_FALLBACK = ["#2a78d6", "#eda100", "#e87ba4", "#008300"];

/** Farbe des n-ten Teilgebiets (0-basiert). */
export function plotColor(index: number): string {
  const slot = index % MAX_PLOTS;
  return cssColor(`--plot-${slot + 1}`, PLOT_FALLBACK[slot]);
}

/** Farben fuer den Bearbeitungsstand einer Strasse oder eines Gebiets. */
export function progressColor(state: "open" | "active" | "done"): string {
  if (state === "done") return cssColor("--energy-600", "#059450");
  if (state === "active") return cssColor("--brand-600", "#0f5cab");
  return cssColor("--ink-muted", "#5b6b82");
}
