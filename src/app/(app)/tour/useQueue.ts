"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { flush, getQueue, QUEUE_FLUSHED_EVENT, subscribe, type FlushResult, type QueuedWrite } from "@/lib/offline-queue";
import { levelFeedbackText, type LevelFeedback } from "@/lib/level-feedback";

/**
 * Warteschlange und Netz im Blick: was noch nicht beim Server ist, wird
 * automatisch nachgesendet, sobald Empfang da ist (app-weit in
 * src/components/OfflineSupport.tsx - von dort kommen auch die Toasts). Die
 * Oberflaeche zeigt davon nur eine kleine Plakette - erfasst wird ohne
 * Unterbrechung weiter.
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
    // Nachgesendete Eintraege bringen XP mit - der Level-Ring zaehlt sie mit.
    const flushed = (event: Event) => onProgress((event as CustomEvent<FlushResult>).detail.progression);
    window.addEventListener(QUEUE_FLUSHED_EVENT, flushed);

    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      unsubscribe();
      window.removeEventListener(QUEUE_FLUSHED_EVENT, flushed);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [userId, onProgress]);

  const sendNow = useCallback(async () => {
    const result = await flush(userId);
    if (result.sent > 0) {
      onProgress(result.progression);
      notify(
        [result.sent === 1 ? "1 Eintrag gesendet" : `${result.sent} Einträge gesendet`, levelFeedbackText(result.progression)]
          .filter(Boolean)
          .join(" · "),
      );
    } else if (getQueue(userId).some((entry) => !entry.error)) {
      notify("Noch kein Empfang – Einträge bleiben gespeichert");
    } else if (result.remaining > 0) {
      notify(heldText(result.remaining));
    } else if (result.rejected === 0) {
      notify("Alles ist gesendet");
    }
    if (result.rejected > 0) notify("Ein Eintrag konnte nicht gespeichert werden");
    else if (result.held > 0) notify(heldText(result.held));
    if (result.sent > 0 || result.rejected > 0) router.refresh();
  }, [userId, onProgress, notify, router]);

  return { pending, online, sendNow };
}

/** Eintraege, die der Server ablehnt, bis jemand sie verwirft - der Grund steht in "Heute". */
function heldText(count: number): string {
  return count === 1
    ? "1 Eintrag wird nicht angenommen – Grund unter „Heute“"
    : `${count} Einträge werden nicht angenommen – Grund unter „Heute“`;
}
