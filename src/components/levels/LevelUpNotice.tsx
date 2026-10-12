"use client";

import Link from "next/link";
import { useEffect } from "react";
import { IconTrophy } from "@/components/icons";
import type { LevelFeedback } from "@/lib/level-feedback";

export function LevelUpNotice({ feedback, onDismiss }: {
  feedback: LevelFeedback | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(onDismiss, 9000);
    return () => window.clearTimeout(timeout);
  }, [feedback, onDismiss]);

  if (!feedback?.levelUp) return null;
  return (
    <aside className="card fixed left-4 right-4 top-20 z-40 mx-auto max-w-sm border p-4 md:left-auto md:right-8 md:top-6"
      style={{ borderColor: "var(--brand-500)", boxShadow: "var(--shadow-3)" }}
      role="status" aria-live="polite" aria-atomic="true">
      <div className="flex items-start gap-3">
        <span className="tile-icon h-11 w-11 shrink-0 bg-brand-900 text-white" aria-hidden="true">
          <IconTrophy className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="muted text-xs font-semibold">Levelaufstieg</p>
          <p className="text-lg font-bold">Level {feedback.progress.level} erreicht!</p>
          <p className="muted text-sm">{feedback.progress.title} · Weiter so.</p>
          <Link href="/level" onClick={onDismiss} className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:underline">
            Fortschritt ansehen →
          </Link>
        </div>
        <button type="button" className="icon-btn shrink-0" aria-label="Levelaufstieg schließen" onClick={onDismiss}>×</button>
      </div>
    </aside>
  );
}
