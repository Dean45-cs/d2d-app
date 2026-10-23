import { SkeletonText } from "@/components/ui";

/**
 * Platzhalter der Tuer: Kopf, grosse Nummer, Ergebnisleiste, Haeuser -
 * aufgebaut wie die Seite (dieselben Klassen wie TourClient), damit auf
 * Handy und iPad, hochkant wie quer, beim Laden nichts springt.
 */
export default function LoadingTour() {
  return (
    <div className="tour" aria-busy="true" aria-label="Klinken wird geladen">
      <div className="tour-grid" aria-hidden="true">
        <header className="tour-head pb-4 md:pb-0">
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

        <div className="tour-door">
          <section className="door-hero flex flex-col items-center py-2 text-center">
            <div className="grid w-full grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 md:grid-cols-[56px_minmax(0,1fr)_56px]">
              <span className="skeleton h-11 w-11 rounded-full md:h-14 md:w-14" />
              <span className="door-number block">
                <SkeletonText width="min(48%, 9rem)" className="rounded-2xl" />
              </span>
              <span className="skeleton h-11 w-11 rounded-full md:h-14 md:w-14" />
            </div>
            <p className="mt-2 w-full text-subhead">
              <SkeletonText width="min(52%, 12rem)" />
            </p>
            <div className="mt-2 flex h-11 items-center justify-center gap-4">
              <span className="skeleton h-4 w-32 rounded-full" />
            </div>
          </section>
        </div>

        <div className="tray glass-strong">
          <div className="tray-grid">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="tray-btn skeleton bg-fill" />
            ))}
          </div>
        </div>

        <div className="tour-lists">
          <div className="mb-2 flex min-h-11 items-center px-1 text-footnote">
            <SkeletonText width="min(30%, 7rem)" />
          </div>
          <div className="chips house-chips -mx-4 px-4 pb-1 md:mx-0 md:px-0 md:pb-0">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className="skeleton h-9 w-16 shrink-0 rounded-full md:h-12 md:w-auto" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
