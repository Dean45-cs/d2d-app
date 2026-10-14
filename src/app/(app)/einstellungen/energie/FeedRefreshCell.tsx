"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { Cell, plural } from "@/components/ui";
import { IconRefresh } from "@/components/icons";

/** Tagesquelle von Hand abrufen - derselbe Aufruf wie auf der Karte. */
export function FeedRefreshCell() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function refreshFeed() {
    setBusy(true);
    try {
      const response = await fetch("/api/energy/refresh", { method: "POST" });
      const data = await response.json();
      toast(response.ok ? `${plural(data.rowCount, "Ort", "Orte")} abgerufen` : (data.error ?? data.message ?? "Abruf fehlgeschlagen"));
      // Auch ein Fehlschlag steht danach im Protokoll.
      router.refresh();
    } catch {
      toast("Keine Verbindung");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <Cell
        onClick={() => void refreshFeed()}
        disabled={busy}
        tone="accent"
        title={busy ? "Wird abgerufen …" : "Jetzt abrufen"}
        trailing={<IconRefresh className={`h-5 w-5 shrink-0 text-accent-ink ${busy ? "spin" : ""}`} />}
      />
    </li>
  );
}
