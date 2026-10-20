"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IconOffline } from "./icons";
import { Notice } from "./ui";
import { useToast } from "./Toast";
import { getQueue, QUEUE_FLUSHED_EVENT, startAutoFlush, subscribe, type FlushResult } from "@/lib/offline-queue";
import { levelFeedbackText } from "@/lib/level-feedback";
import { copyLabel, forgetOfflineCopy, offlineCopyTime, warmOfflinePages } from "@/lib/offline-pages";

/**
 * Netz-Aussetzer auf jeder Seite der App abfangen:
 *  - Wartende Eintraege gehen raus, sobald Empfang da ist - egal, welche
 *    Seite gerade offen ist (nicht nur beim Klinken).
 *  - Klinken und Termine werden im Hintergrund frisch gespeichert, damit die
 *    App auch nach einem Neustart im Funkloch damit startet (public/sw.js).
 *  - Zeigt der Service Worker eine gespeicherte Seite, sagt ein Hinweis von
 *    wann sie ist - und bei Empfang wird sie von selbst aktualisiert.
 *
 * `renderedAt` setzt das Layout bei jedem Server-Aufruf neu: aendert er sich,
 * sind frische Daten da.
 */
export function OfflineSupport({ userId, renderedAt }: { userId: number; renderedAt: number }) {
  const router = useRouter();
  const toast = useToast();
  const pathname = usePathname();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [copy, setCopy] = useState<Date | null>(null);
  const shownRender = useRef(renderedAt);

  /* ------------------------- Netz und Warteschlange ----------------------- */

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    setPending(getQueue(userId).length);
    return subscribe((queue) => setPending(queue.length), userId);
  }, [userId]);

  useEffect(
    () =>
      startAutoFlush((result: FlushResult) => {
        window.dispatchEvent(new CustomEvent(QUEUE_FLUSHED_EVENT, { detail: result }));
        if (result.sent > 0) {
          toast(
            [
              result.sent === 1 ? "1 Eintrag nachgesendet" : `${result.sent} Einträge nachgesendet`,
              levelFeedbackText(result.progression),
            ]
              .filter(Boolean)
              .join(" · "),
          );
        }
        if (result.rejected > 0) {
          toast(
            result.rejected === 1
              ? "1 Eintrag konnte nicht gespeichert werden"
              : `${result.rejected} Einträge konnten nicht gespeichert werden`,
          );
        }
        if (result.held > 0) {
          toast(
            result.held === 1
              ? "1 Eintrag wird nicht angenommen – Grund unter Klinken › „Heute“"
              : `${result.held} Einträge werden nicht angenommen – Grund unter Klinken › „Heute“`,
          );
        }
        if (result.sent > 0 || result.rejected > 0) router.refresh();
      }, userId),
    [userId, router, toast],
  );

  /*
   * Liegen Eintraege nur auf dem Geraet, den Browser bitten, sie nicht bei
   * Platzmangel wegzuraeumen. Einmal reicht.
   */
  const askedPersist = useRef(false);
  useEffect(() => {
    if (pending === 0 || askedPersist.current) return;
    askedPersist.current = true;
    const storage = navigator.storage;
    if (!storage?.persist || !storage.persisted) return;
    void storage
      .persisted()
      .then((persisted) => (persisted ? undefined : storage.persist()))
      .catch(() => undefined);
  }, [pending]);

  /* --------------------------- Gespeicherte Seiten ------------------------- */

  useEffect(() => {
    const warm = () => warmOfflinePages();
    // Bevor das Handy die App wegraeumt: den aktuellen Stand speichern.
    const onHide = () => {
      if (document.visibilityState === "hidden") warm();
    };
    const timer = window.setTimeout(warm, 4000);
    window.addEventListener("online", warm);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", warm);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => setCopy(offlineCopyTime()), []);

  // Frische Daten vom Server: der Hinweis auf den gespeicherten Stand kann weg.
  useEffect(() => {
    if (renderedAt === shownRender.current) return;
    shownRender.current = renderedAt;
    forgetOfflineCopy();
    setCopy(null);
  }, [renderedAt]);

  // Gespeicherte Seite und Empfang da: im Hintergrund nachladen, ohne Eingaben zu verlieren.
  useEffect(() => {
    if (copy && online) router.refresh();
  }, [copy, online, router]);

  /* --------------------------------- Ansicht ------------------------------- */

  // Beim Klinken zeigt der Kopf "Offline" schon selbst.
  const offlineHint = !online && !pathname.startsWith("/tour");
  if (!copy && !offlineHint) return null;

  const waiting = pending === 1 ? "1 Eintrag wartet" : `${pending} Einträge warten`;
  const text = copy
    ? online
      ? `Gespeicherter Stand von ${copyLabel(copy)} – wird aktualisiert, sobald der Server antwortet`
      : `Ohne Netz · gespeicherter Stand von ${copyLabel(copy)}`
    : pending > 0
      ? `Keine Verbindung · ${waiting} auf Empfang`
      : "Keine Verbindung – Änderungen hier brauchen Netz";

  return (
    <div className="page-narrow mb-4" role="status">
      <Notice icon={<IconOffline className="h-5 w-5" />}>{text}</Notice>
    </div>
  );
}
