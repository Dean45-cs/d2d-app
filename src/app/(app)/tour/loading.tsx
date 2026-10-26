import { SkeletonText } from "@/components/ui";

/**
 * Platzhalter der Tuer: Kopf, Ergebnisleiste, Liste der Haeuser - aufgebaut
 * wie die Seite (dieselben Klassen wie TourClient), damit auf Handy und iPad,
 * hochkant wie quer, beim Laden nichts springt.
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

        <div className="tray glass-strong">
          <p className="px-2 py-2 text-center text-subhead md:text-headline">
            <SkeletonText width="min(50%, 12rem)" className="mx-auto" />
          </p>
        </div>

        <div className="tour-lists space-y-4">
          <div className="flex items-center gap-2">
            <span className="skeleton h-11 flex-1 rounded-md" />
            <span className="skeleton h-11 w-11 shrink-0 rounded-full" />
            <span className="skeleton h-11 w-28 shrink-0 rounded-full" />
          </div>
          <div className="door-table">
            <div className="door-table-head">
              <span className="door-lead-col">Nr.</span>
              <span className="flex-1">Stand</span>
            </div>
            <ul>
              {Array.from({ length: 8 }, (_, i) => (
                <li key={i}>
                  <div className="door-row">
                    <span className="door-lead">
                      <span className="skeleton h-5 w-8 rounded-md" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body">
                        <SkeletonText width={`${48 + ((i * 17) % 30)}%`} />
                      </span>
                      <span className="block text-footnote">
                        <SkeletonText width={`${30 + ((i * 11) % 20)}%`} />
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="tray-space" />
        </div>
      </div>
    </div>
  );
}
