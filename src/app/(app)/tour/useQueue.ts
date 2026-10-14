"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { flush, getQueue, startAutoFlush, subscribe, type QueuedWrite } from "@/lib/offline-queue";
import { levelFeedbackText, type LevelFeedback } from "@/lib/level-feedback";

/**
 * Warteschlange und Netz im Blick: was noch nicht beim Server ist, wird
 * automatisch nachgesendet, sobald Empfang da ist. Die Oberflaeche zeigt
 * davon nur eine kleine Plakette - erfasst wird ohne Unterbrechung weiter.
 */
export function useQueue(
  userId: number,
  onProgress: (feedback?: LevelFeedback) => void,
  notify: (text: string) => void,
) {
  const router = useRouter();
  const [pending, setPending] = useState<QueuedWrite[]>([]);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setPending(getQueue(userId));
    setOnline(navigator.onLine);
    const unsubscribe = subscribe(setPending, userId);
    const stopAutoFlush = startAutoFlush((result) => {
      if (result.sent > 0) {
        onProgress(result.progression);
        notify(
          [
            result.sent === 1 ? "1 Eintrag nachgesendet" : `${result.sent} Einträge nachgesendet`,
            levelFeedbackText(result.progression),
          ]
            .filter(Boolean)
            .join(" · "),
        );
      }
      if (result.rejected > 0) {
        notify(
          result.rejected === 1
            ? "1 Eintrag konnte nicht gespeichert werden"
            : `${result.rejected} Einträge konnten nicht gespeichert werden`,
        );
      }
      router.refresh();
    }, userId);

    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      unsubscribe();
      stopAutoFlush();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [router, userId, onProgress, notify]);

  const sendNow = useCallback(async () => {
    const result = await flush(userId);
    if (result.sent > 0) {
      onProgress(result.progression);
      notify(
        [result.sent === 1 ? "1 Eintrag gesendet" : `${result.sent} Einträge gesendet`, levelFeedbackText(result.progression)]
          .filter(Boolean)
          .join(" · "),
      );
    } else if (result.remaining > 0) {
      notify("Noch kein Empfang – Einträge bleiben gespeichert");
    } else if (result.rejected === 0) {
      notify("Alles ist gesendet");
    }
    if (result.rejected > 0) notify("Ein Eintrag konnte nicht gespeichert werden");
    if (result.sent > 0 || result.rejected > 0) router.refresh();
  }, [userId, onProgress, notify, router]);

  return { pending, online, sendNow };
}
