"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { IconBattery } from "./icons";
import { useToast } from "./Toast";
import { Cell, Switch } from "./ui";
import { applyPowerSaving, onPowerChange, powerSaving, setPowerSaving, storedPowerSaving } from "@/lib/power";

/**
 * Ist der Super-Energiesparmodus an? Rendert neu, sobald er wechselt. Zum
 * Anzeigen - beim ersten Bild nach dem Laden noch "aus" wie auf dem Server;
 * Effekte lesen powerSaving() selbst.
 */
export function usePowerSaving(): boolean {
  return useSyncExternalStore(onPowerChange, powerSaving, () => false);
}

/**
 * Haelt die Seite beim Modus des Geraets - auch nach einem Seitenwechsel,
 * bei dem Next.js eigene Farben fuer die Statusleiste vor unsere setzen koennte.
 */
export function PowerMode() {
  const pathname = usePathname();
  useEffect(() => {
    applyPowerSaving(storedPowerSaving());
  }, [pathname]);
  return null;
}

/** Der Schalter im Profil unter "Dieses Gerät". */
export function PowerSaveCell() {
  const saving = usePowerSaving();
  const toast = useToast();

  function toggle(on: boolean) {
    setPowerSaving(on);
    toast(on ? "Super-Energiesparmodus ist an" : "Super-Energiesparmodus ist aus");
  }

  return (
    <li>
      <Cell
        icon={
          <span className="glyph">
            <IconBattery className="h-4 w-4" />
          </span>
        }
        title="Super-Energiesparmodus"
        subtitle="Dunkel, ohne Effekte, Standort nur auf Antippen"
        wrap
        trailing={<Switch checked={saving} onChange={toggle} label="Super-Energiesparmodus auf diesem Gerät" />}
      />
    </li>
  );
}
