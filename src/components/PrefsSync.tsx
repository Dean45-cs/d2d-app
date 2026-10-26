"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { DEFAULT_PREFS, applyPrefs, onPrefsChange, readPrefs, type Preferences } from "@/lib/preferences";

/**
 * Die Einstellungen dieses Geraets - rendert neu, sobald sich eine aendert.
 * Beim ersten Bild nach dem Laden gilt noch der Standard (wie auf dem
 * Server); was man sieht, haben die Merkmale am <html> da schon gesetzt.
 */
export function usePrefs(): Preferences {
  return useSyncExternalStore(onPrefsChange, readPrefs, () => DEFAULT_PREFS as Preferences);
}

/**
 * Haelt die Merkmale am <html> beim Stand des Geraets - auch nach einem
 * Seitenwechsel und wenn ein anderes Fenster der App etwas umstellt.
 */
export function PrefsSync() {
  const pathname = usePathname();
  useEffect(() => {
    applyPrefs();
  }, [pathname]);
  useEffect(() => onPrefsChange(() => undefined), []);
  return null;
}
