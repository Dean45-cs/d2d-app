"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enqueue, flush, getQueue } from "@/lib/offline-queue";
import { localSaleDrafts, SALE_DRAFT_EVENT, storeSaleDrafts } from "@/lib/sale-drafts-client";
import type { SaleDraft } from "@/lib/sale-drafts";
import type { LevelFeedback } from "@/lib/level-feedback";
import { levelFeedbackText } from "@/lib/level-feedback";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { IconCheckCircle, IconExternal } from "@/components/icons";
import { Cell } from "@/components/ui";

const TARIFRECHNER = process.env.NEXT_PUBLIC_TARIFRECHNER_URL ?? "https://portal-ep24.de/menues/tarifrechner/";

/**
 * Offene Auftraege: im Tarifrechner begonnen, hier noch nicht bestaetigt.
 * Erst die Bestaetigung zaehlt als Abschluss (XP, Feed). Kommt man aus dem
 * Tarifrechner zurueck, fragt die App von selbst nach.
 */
export function PendingSales({
  userId,
  onProgress,
}: {
  userId: number;
  onProgress?: (feedback?: LevelFeedback) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [drafts, setDrafts] = useState<SaleDraft[]>([]);
  const [selected, setSelected] = useState<SaleDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const serverDrafts = useRef<SaleDraft[]>([]);
  const syncing = useRef(false);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  const merge = useCallback(() => {
    const local = localSaleDrafts(userId);
    const localKeys = new Set(local.map((item) => item.draft_key));
    setDrafts([
      ...local.filter((item) => item.status === "OPEN"),
      ...serverDrafts.current.filter((item) => !localKeys.has(item.draft_key)),
    ]);
  }, [userId]);

  const sync = useCallback(
    async (decided?: "CONFIRM" | "ABORT") => {
      merge();
      if (syncing.current || !navigator.onLine) return;
      syncing.current = true;
      try {
        const result = await flush(userId);
        if (result.progression) progressRef.current?.(result.progression);
        if (result.rejected) toast("Ein Vorgang konnte nicht gespeichert werden");
        else if (result.sent && decided === "CONFIRM") {
          toast(["Abschluss bestätigt", levelFeedbackText(result.progression)].filter(Boolean).join(" · "), {
            tone: "result",
          });
        } else if (result.sent && !decided) {
          toast(
            [result.sent === 1 ? "1 Eintrag nachgesendet" : `${result.sent} Einträge nachgesendet`, levelFeedbackText(result.progression)]
              .filter(Boolean)
              .join(" · "),
          );
        }
        if (result.sent) router.refresh();
        const response = await fetch("/api/sale-drafts", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        serverDrafts.current = data.drafts;
        const queueKeys = new Set(
          getQueue(userId)
            .filter((item) => item.url === "/api/sale-drafts")
            .map((item) => item.payload.draftKey),
        );
        const remoteKeys = new Set(serverDrafts.current.map((item) => item.draft_key));
        storeSaleDrafts(
          userId,
          localSaleDrafts(userId)
            .filter(
              (item) =>
                queueKeys.has(item.draft_key) ||
                (item.status === "OPEN" && (remoteKeys.has(item.draft_key) || !item.synced)),
            )
            .map((item) => ({ ...item, synced: item.synced || remoteKeys.has(item.draft_key) })),
        );
        merge();
      } catch {
        /* Warteschlange und lokale Vorgaenge ueberstehen ein Funkloch. */
      } finally {
        syncing.current = false;
      }
    },
    [userId, router, merge, toast],
  );

  useEffect(() => {
    const refresh = () => {
      merge();
      void sync();
    };
    // Zurueck aus dem Tarifrechner: gleich nachfragen.
    const returned = () => {
      refresh();
      const latest = localSaleDrafts(userId).find((item) => item.status === "OPEN");
      if (latest) setSelected(latest);
    };
    refresh();
    window.addEventListener(SALE_DRAFT_EVENT, merge);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", returned);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener(SALE_DRAFT_EVENT, merge);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", returned);
      window.clearInterval(timer);
    };
  }, [userId, merge, sync]);

  async function decide(draft: SaleDraft, action: "CONFIRM" | "ABORT") {
    setBusy(true);
    try {
      const local = localSaleDrafts(userId);
      const own = local.find((item) => item.draft_key === draft.draft_key);
      // Eine noch nicht synchronisierte Eroeffnung vor der Entscheidung erneut einreihen.
      if (
        own &&
        !serverDrafts.current.some((item) => item.draft_key === draft.draft_key) &&
        !getQueue(userId).some((item) => item.url === "/api/sale-drafts" && item.payload.draftKey === draft.draft_key)
      ) {
        enqueue(
          `Auftrag begonnen · ${draft.label}`,
          { ...own.payload, draftKey: draft.draft_key, action: "OPEN" },
          { url: "/api/sale-drafts", ownerUserId: userId },
        );
      }
      enqueue(
        `${action === "CONFIRM" ? "Abschluss bestätigen" : "Auftrag abbrechen"} · ${draft.label}`,
        { draftKey: draft.draft_key, action },
        { url: "/api/sale-drafts", ownerUserId: userId },
      );
      storeSaleDrafts(userId, [
        ...local.filter((item) => item.draft_key !== draft.draft_key),
        {
          ...draft,
          ownerUserId: userId,
          status: action === "CONFIRM" ? "CONFIRMED" : "ABORTED",
          payload: own?.payload ?? {},
        },
      ]);
      setSelected(null);
      merge();
      if (!navigator.onLine) toast("Offline vorgemerkt – wird bei Empfang gespeichert");
      else if (action === "ABORT") toast("Auftrag verworfen");
      await sync(action);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {drafts.length > 0 && (
        <ul className="list list-icons mb-4" aria-label="Offene Aufträge">
          {drafts.map((draft) => (
            <li key={draft.draft_key}>
              <Cell
                onClick={() => setSelected(draft)}
                icon={
                  <span className="glyph glyph-round text-accent-ink">
                    <IconCheckCircle className="h-5 w-5" />
                  </span>
                }
                title={draft.label}
                subtitle="Offener Auftrag · bestätigen"
              />
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <Sheet title="Auftrag abgeschlossen?" subtitle={selected.label} onClose={() => setSelected(null)}>
          <div className="grid gap-2">
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={busy}
              onClick={() => void decide(selected, "CONFIRM")}
            >
              Abschluss bestätigen
            </button>
            <a className="btn btn-secondary btn-lg btn-block" href={TARIFRECHNER} target="_blank" rel="noreferrer">
              Tarifrechner öffnen
              <IconExternal className="h-4 w-4" />
            </a>
            <button
              type="button"
              className="btn btn-plain btn-block text-danger"
              disabled={busy}
              onClick={() => void decide(selected, "ABORT")}
            >
              Nicht zustande gekommen
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
