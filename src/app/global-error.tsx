"use client";

import "./globals.css";
import { EmptyState } from "@/components/ui";
import { IconRefresh } from "@/components/icons";

/**
 * Letzte Rueckfallebene, wenn schon das Grundgeruest scheitert - ersetzt
 * das Wurzel-Layout und bringt deshalb html und body selbst mit.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body>
        <main className="min-h-dvh bg-bg px-4 pt-[max(3rem,env(safe-area-inset-top))]">
          <div className="mx-auto w-full max-w-md">
            <EmptyState
              boxed
              icon={<IconRefresh className="h-6 w-6" />}
              title="Das hat nicht geklappt"
              text="Carlsson Sales konnte nicht starten. Bitte gleich noch einmal versuchen."
              action={
                <button type="button" className="btn btn-primary btn-sm" onClick={reset}>
                  Erneut versuchen
                </button>
              }
            />
          </div>
        </main>
      </body>
    </html>
  );
}
