"use client";

import { useEffect } from "react";

/**
 * Meldet den Service Worker an, damit die App vom Home-Bildschirm startet und
 * bei Funkloch nicht mit einer Fehlerseite abbricht.
 * Nur im Produktionsbetrieb – in der Entwicklung stört der Cache.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ohne Service Worker funktioniert die App weiterhin, nur ohne Offline-Seite.
    });
  }, []);
  return null;
}
