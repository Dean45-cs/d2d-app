"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enqueue, flush, getQueue } from "@/lib/offline-queue";
import { localSaleDrafts, SALE_DRAFT_EVENT, storeSaleDrafts } from "@/lib/sale-drafts-client";
import type { SaleDraft } from "@/lib/sale-drafts";
import type { LevelFeedback } from "@/lib/level-feedback";
import { levelFeedbackText } from "@/lib/level-feedback";
import { Sheet } from "@/components/Sheet";

export function PendingSales({ userId, onProgress }: { userId: number; onProgress?: (feedback?: LevelFeedback) => void }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<SaleDraft[]>([]);
  const [selected, setSelected] = useState<SaleDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const serverDrafts = useRef<SaleDraft[]>([]);
  const syncing = useRef(false);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  const merge = useCallback(() => {
    const local = localSaleDrafts(userId);
    const localKeys = new Set(local.map((item) => item.draft_key));
    setDrafts([...local.filter((item) => item.status === "OPEN"),
      ...serverDrafts.current.filter((item) => !localKeys.has(item.draft_key))]);
  }, [userId]);

  const sync = useCallback(async () => {
    merge();
    if (syncing.current || !navigator.onLine) return;
    syncing.current = true;
    try {
      const result = await flush(userId);
      if (result.progression) {
        progressRef.current?.(result.progression);
        setMessage(levelFeedbackText(result.progression));
      }
      if (result.rejected) setMessage("Ein Vorgang konnte nicht gespeichert werden. Bitte offene Aufträge prüfen.");
      if (result.sent) {
        if (!result.progression && !result.rejected) setMessage("Vorgang gespeichert.");
        router.refresh();
      }
      const response = await fetch("/api/sale-drafts", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      serverDrafts.current = data.drafts;
      const queueKeys = new Set(getQueue(userId).filter((item) => item.url === "/api/sale-drafts").map((item) => item.payload.draftKey));
      if (!queueKeys.size && !result.progression) {
        setMessage((current) => current.startsWith("Entscheidung wird") || current.startsWith("Lokal vorgemerkt") ? "" : current);
      }
      const remoteKeys = new Set(serverDrafts.current.map((item) => item.draft_key));
      storeSaleDrafts(userId, localSaleDrafts(userId).filter((item) => queueKeys.has(item.draft_key)
        || (item.status === "OPEN" && (remoteKeys.has(item.draft_key) || !item.synced)))
        .map((item) => ({ ...item, synced: item.synced || remoteKeys.has(item.draft_key) })));
      merge();
    } catch { /* The persistent queue and local drafts survive a lost connection. */ }
    finally { syncing.current = false; }
  }, [userId, router, merge]);

  useEffect(() => {
    const refresh = () => { merge(); void sync(); };
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
    setMessage("");
    try {
      const local = localSaleDrafts(userId);
      const own = local.find((item) => item.draft_key === draft.draft_key);
      // Requeue an unsynchronised opening before its decision, including after a rejected send.
      if (own && !serverDrafts.current.some((item) => item.draft_key === draft.draft_key)
        && !getQueue(userId).some((item) => item.url === "/api/sale-drafts" && item.payload.draftKey === draft.draft_key)) {
        enqueue(`Auftrag begonnen · ${draft.label}`, { ...own.payload, draftKey: draft.draft_key, action: "OPEN" },
          { url: "/api/sale-drafts", ownerUserId: userId });
      }
      enqueue(`${action === "CONFIRM" ? "Abschluss bestätigen" : "Auftrag abbrechen"} · ${draft.label}`,
        { draftKey: draft.draft_key, action }, { url: "/api/sale-drafts", ownerUserId: userId });
      storeSaleDrafts(userId, [...local.filter((item) => item.draft_key !== draft.draft_key),
        { ...draft, ownerUserId: userId, status: action === "CONFIRM" ? "CONFIRMED" : "ABORTED", payload: own?.payload ?? {} }]);
      setSelected(null);
      merge();
      setMessage(navigator.onLine ? "Entscheidung wird gespeichert …" : "Lokal vorgemerkt – wird bei Verbindung gespeichert. XP zählen danach.");
      await sync();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  const actions = (draft: SaleDraft) => <div className="mt-3 flex flex-wrap gap-2">
    <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void decide(draft, "CONFIRM")}>Abschluss bestätigen</button>
    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setSelected(null)}>Später fortsetzen</button>
    <button className="btn btn-ghost btn-sm text-danger" disabled={busy} onClick={() => void decide(draft, "ABORT")}>Abgebrochen</button>
  </div>;

  return <>
    {drafts.length > 0 && <section className="card mb-4 p-4" aria-label="Offene Aufträge">
      <h2 className="text-[16px] font-semibold">Offene Aufträge · {drafts.length}</h2>
      <p className="muted mt-1 text-[12px]">Erst bestätigen, wenn der Auftrag im Tarifrechner abgeschlossen wurde.</p>
      <ul className="mt-2 space-y-3">{drafts.map((draft) => <li key={draft.draft_key}>
        <button className="text-left text-[14px] font-medium text-tint" onClick={() => setSelected(draft)}>{draft.label}</button>
        <div className="mt-1 flex gap-2">
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setSelected(draft)}>Auftrag prüfen</button>
          <a className="btn btn-ghost btn-sm" href={process.env.NEXT_PUBLIC_TARIFRECHNER_URL ?? "https://portal-ep24.de/menues/tarifrechner/"} target="_blank" rel="noreferrer">Tarifrechner öffnen</a>
        </div>
      </li>)}</ul>
    </section>}
    {message && <p className="mb-3 text-[13px]" role="status">{message}</p>}
    {selected && <Sheet title="Auftrag abgeschlossen?" subtitle={selected.label} onClose={() => setSelected(null)}>
      <p className="muted text-[14px]">Mit der Bestätigung zählen Abschluss, XP und Feedmeldung. Bei „Später fortsetzen“ bleibt der Auftrag offen.</p>
      {actions(selected)}
    </Sheet>}
  </>;
}
