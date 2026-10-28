/**
 * Karten brauchen echte Farbwerte, die Farben der App stehen aber als
 * CSS-Variablen in brand.css und globals.css. Diese Bruecke liest sie zur
 * Laufzeit - so stimmen Karte und Oberflaeche ueberein, auch im Dunkeln.
 */
export function cssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

import { MAX_PLOTS } from "@/lib/geo/split";

const PLOT_FALLBACK = ["#2a78d6", "#eda100", "#e87ba4", "#008300", "#8800ff", "#4f6273"];

/** Farbe des n-ten Teilgebiets (0-basiert). */
export function plotColor(index: number): string {
  const slot = index % MAX_PLOTS;
  return cssColor(`--plot-${slot + 1}`, PLOT_FALLBACK[slot]);
}

/** Bearbeitungsstand einer Strasse oder eines Gebiets: offen grau, in Arbeit gruen, fertig dunkel. */
export function progressColor(state: "open" | "active" | "done"): string {
  if (state === "done") return cssColor("--ink-2", "#3c3c43");
  if (state === "active") return cssColor("--accent", "#1f9d4c");
  return cssColor("--muted", "#68686f");
}

export type DoorState = "open" | "retry" | "appointment" | "sale" | "done" | "blocked";

/**
 * Darstellung einer Tuer auf der Karte - Form vor Farbe:
 *   offen        hohl (Flaeche, kraeftiger Rand)
 *   nochmal      grau gefuellt
 *   Termin       dunkel gefuellt
 *   Abschluss    gruen gefuellt - das Ergebnis
 *   erledigt     klein und blass
 *   gesperrt     klein, rot
 */
export function doorStyle(state: DoorState): { color: string; ringColor: string; ringWidth: number; radius: number } {
  const surface = cssColor("--surface", "#ffffff");
  const ink = cssColor("--ink", "#0b0b0d");
  switch (state) {
    case "open":
      return { color: surface, ringColor: ink, ringWidth: 2.5, radius: 6 };
    case "retry":
      return { color: "#8e8e93", ringColor: surface, ringWidth: 1.5, radius: 6 };
    case "appointment":
      return { color: ink, ringColor: surface, ringWidth: 1.5, radius: 7 };
    case "sale":
      return { color: cssColor("--accent", "#1f9d4c"), ringColor: surface, ringWidth: 1.5, radius: 7 };
    case "blocked":
      return { color: cssColor("--danger", "#c9182a"), ringColor: surface, ringWidth: 1.5, radius: 4 };
    case "done":
      return { color: "#aeaeb2", ringColor: surface, ringWidth: 1, radius: 4 };
  }
}
