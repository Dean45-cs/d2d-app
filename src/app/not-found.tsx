import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { EmptyState } from "@/components/ui";
import { IconSearch } from "@/components/icons";

export const metadata: Metadata = { title: "Nicht gefunden" };

/**
 * Unbekannte Adresse ausserhalb der App-Schale - statt der englischen
 * Vorgabe von Next.js dieselbe ruhige Seite wie bei abgelaufenen Einladungen.
 */
export default function NotFound() {
  return (
    <main className="brand-backdrop min-h-dvh px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-md">
        <Logo size={40} className="mb-8" />
        <EmptyState
          boxed
          icon={<IconSearch className="h-6 w-6" />}
          title="Seite nicht gefunden"
          text="Die Adresse gibt es nicht oder nicht mehr."
          action={
            <Link href="/" className="btn btn-primary btn-sm">
              Zur Startseite
            </Link>
          }
        />
      </div>
    </main>
  );
}
