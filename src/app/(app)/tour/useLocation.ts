"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo/area";
import { SAVE_FIX_MS, powerSaving, whileActive } from "@/lib/power";
import { usePowerSaving } from "@/components/PowerSave";

export interface Fix {
  point: LatLng;
  /** Radius (m), in dem man mit hoher Wahrscheinlichkeit steht. */
  accuracy: number;
  /** Zeitpunkt der Messung (ms). */
  at: number;
}

/** "off": Super-Energiesparmodus - geortet wird nur auf Antippen. */
export type LocationStatus = "searching" | "ok" | "off" | "denied" | "unavailable" | "unsupported";

/** Was "In meiner Nähe" dazu sagt, wenn es keinen Standort gibt. */
export const LOCATION_NOTE: Record<Exclude<LocationStatus, "ok">, string> = {
  searching: "Standort wird gesucht …",
  off: "Energiesparmodus – Standort auf Antippen",
  denied: "Standort nicht freigegeben – in den Einstellungen des Browsers erlauben",
  unavailable: "Standort gerade nicht verfügbar",
  unsupported: "Dieses Gerät gibt den Standort nicht frei",
};

const WATCH: PositionOptions = { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 };
const ONCE: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 8_000 };
/**
 * Laenger wartet "In meiner Nähe" nie. Die Zeit der Ortung laeuft erst ab
 * der Freigabe - wird die Frage danach einfach weggeklickt, kaeme sonst
 * keine Antwort, und der Knopf hinge.
 */
const ONCE_LIMIT = 12_000;

/**
 * Der eigene Standort, solange die Tour offen ist. Genau (GPS), denn
 * Haeuser stehen 15 Meter auseinander. Im Hintergrund und waehrend niemand
 * die App bedient (Gespraech an der Tuer) ruht die Ortung - das schont den
 * Akku ueber einen langen Tag; der naechste Tipp weckt sie. Ein Funkloch
 * oder eine Zeitueberschreitung loescht den letzten Stand nicht: der ist
 * meist nur Sekunden alt und besser als keiner.
 *
 * Im Super-Energiesparmodus ortet nur `locate` ("In meiner Nähe"), und der
 * Stand verfaellt nach SAVE_FIX_MS - danach stimmen Entfernungen und die
 * mitgespeicherte Position nicht mehr.
 */
export function useLocation() {
  const saving = usePowerSaving();
  const [fix, setFix] = useState<Fix | null>(null);
  const [status, setStatus] = useState<LocationStatus>("searching");
  const last = useRef<Fix | null>(null);

  const receive = useCallback((position: GeolocationPosition) => {
    const next: Fix = {
      point: [position.coords.latitude, position.coords.longitude],
      accuracy: position.coords.accuracy,
      at: position.timestamp || Date.now(),
    };
    last.current = next;
    setFix(next);
    setStatus("ok");
  }, []);

  const fail = useCallback((error: GeolocationPositionError) => {
    if (error.code === error.PERMISSION_DENIED) {
      last.current = null;
      setFix(null);
      setStatus("denied");
      return;
    }
    if (!last.current) setStatus("unavailable");
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    // powerSaving() statt saving: das ist beim ersten Durchlauf noch "aus".
    if (powerSaving()) {
      setStatus((current) => (current === "denied" ? current : last.current ? "ok" : "off"));
      return;
    }
    if (!last.current) setStatus((current) => (current === "off" ? "searching" : current));
    let watch: number | null = null;
    // Zurueck in der App (auch nach dem Freigeben in den Einstellungen) oder
    // wieder bedient: wieder orten.
    return whileActive(
      () => {
        watch = navigator.geolocation.watchPosition(receive, fail, WATCH);
      },
      () => {
        if (watch !== null) navigator.geolocation.clearWatch(watch);
        watch = null;
      },
    );
  }, [receive, fail, saving]);

  // Energiesparmodus: ein alter Stand gilt nicht mehr.
  useEffect(() => {
    if (!saving || !fix) return;
    const timer = window.setTimeout(
      () => {
        last.current = null;
        setFix(null);
        setStatus((current) => (current === "ok" ? "off" : current));
      },
      Math.max(0, fix.at + SAVE_FIX_MS - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [saving, fix]);

  /** Jetzt einmal frisch orten - fuer den Knopf "In meiner Nähe". */
  const locate = useCallback(
    () =>
      new Promise<{ fix: Fix | null; status: LocationStatus }>((resolve) => {
        if (!("geolocation" in navigator)) {
          resolve({ fix: null, status: "unsupported" });
          return;
        }
        let done = false;
        const finish = (result: { fix: Fix | null; status: LocationStatus }) => {
          if (done) return;
          done = true;
          window.clearTimeout(limit);
          resolve(result);
        };
        // Ohne Antwort zaehlt der letzte Stand - falls es einen gibt.
        const limit = window.setTimeout(
          () => finish({ fix: last.current, status: last.current ? "ok" : "unavailable" }),
          ONCE_LIMIT,
        );
        navigator.geolocation.getCurrentPosition(
          (position) => {
            receive(position);
            finish({ fix: last.current, status: "ok" });
          },
          (error) => {
            fail(error);
            const denied = error.code === error.PERMISSION_DENIED;
            finish({
              fix: denied ? null : last.current,
              status: denied ? "denied" : last.current ? "ok" : "unavailable",
            });
          },
          ONCE,
        );
      }),
    [receive, fail],
  );

  return { fix, status, locate };
}
