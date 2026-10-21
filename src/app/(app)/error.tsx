"use client";

import Link from "next/link";
import { useEffect } from "react";
import { EmptyState } from "@/components/ui";
import { IconRefresh } from "@/components/icons";

/**
 * Fehler beim Aufbau einer Seite. Die Schale bleibt bedienbar; statt der
 * englischen Vorgabe ein Satz und zwei Wege weiter.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-narrow pt-12">
      <EmptyState
        boxed
        icon={<IconRefresh className="h-6 w-6" />}
        title="Das hat nicht geklappt"
        text="Die Seite konnte nicht geladen werden. Meist hilft ein zweiter Versuch."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={reset}>
              Erneut versuchen
            </button>
            <Link href="/" className="btn btn-secondary btn-sm">
              Zur Startseite
            </Link>
          </div>
        }
      />
    </div>
  );
}
