import { SkeletonText } from "@/components/ui";

/** Platzhalter der Tuer: Kopf, grosse Nummer, Ergebnisleiste - aufgebaut wie die Seite, nichts springt. */
export default function LoadingTour() {
  return (
    <div
      className="mx-auto max-w-xl lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8"
      aria-busy="true"
      aria-label="Klinken wird geladen"
    >
      <header className="pb-4 lg:col-span-2" aria-hidden="true">
        <div className="flex h-11 items-center gap-2">
          <span className="skeleton h-7 w-7 shrink-0 rounded-full" />
          <span className="flex-1 text-subhead">
            <SkeletonText width="min(36%, 8rem)" />
          </span>
          <span className="skeleton -mr-1 h-7 w-7 shrink-0 rounded-md" />
        </div>
        <p className="mt-1 text-large-title">
          <SkeletonText width="min(64%, 18rem)" />
        </p>
        <p className="mt-1 text-subhead">
          <SkeletonText width="min(44%, 12rem)" />
        </p>
      </header>

      <div className="space-y-4 lg:col-start-2 lg:row-start-2" aria-hidden="true">
        <section className="flex flex-col items-center py-2 text-center">
          <div className="grid w-full grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
            <span className="skeleton h-11 w-11 rounded-full" />
            <span className="block text-hero">
              <SkeletonText width="min(48%, 9rem)" className="rounded-2xl" />
            </span>
            <span className="skeleton h-11 w-11 rounded-full" />
          </div>
          <p className="mt-2 w-full text-subhead">
            <SkeletonText width="min(52%, 12rem)" />
          </p>
          <div className="mt-2 flex h-11 items-center justify-center gap-4">
            <span className="skeleton h-4 w-32 rounded-full" />
          </div>
        </section>
        <div className="tray glass-strong">
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="skeleton block h-15 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
