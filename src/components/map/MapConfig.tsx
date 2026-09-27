"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MapConfig } from "@/lib/map";

const DEFAULT: MapConfig = {
  provider: "openfreemap",
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  styles: {
    light: "https://tiles.openfreemap.org/styles/liberty",
    dark: "https://tiles.openfreemap.org/styles/dark",
  },
};

const MapConfigContext = createContext<MapConfig>(DEFAULT);

/**
 * Der Server entscheidet einmal im Layout, welche Karte gezeigt wird - jede
 * Karte darunter liest es hier ab, ohne dass es durch alle Seiten gereicht
 * werden muss.
 */
export function MapConfigProvider({ value, children }: { value: MapConfig; children: ReactNode }) {
  return <MapConfigContext.Provider value={value}>{children}</MapConfigContext.Provider>;
}

export function useMapConfig(): MapConfig {
  return useContext(MapConfigContext);
}
