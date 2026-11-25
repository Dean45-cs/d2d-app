import {
  SegmentedLinks,
  SkeletonHeader,
  SkeletonLine,
  SkeletonText,
} from "@/components/ui";
import { TEAM_VIEWS } from "../views";

/** Platzhalter der Erfolge - Ringe von heute, Rang, Abzeichen. */
export default function LoadingAchievements() {
  return (
    <div className="page" aria-busy="true" aria-label="Erfolge werden geladen">
      <SkeletonHeader title="Erfolge">
        <SegmentedLinks ariaLabel="Team" current="erfolge" options={TEAM_VIEWS} className="max-w-md seg-tight" />
      </SkeletonHeader>
      <div className="space-y-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-hidden="true">
            <div className="surface p-4">
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <span className="text-headline">Heute</span>
                <SkeletonLine width={56} height={12} />
              </div>
              <div className="flex items-center gap-6">
                <span className="skeleton h-[132px] w-[132px] shrink-0 rounded-full" />
                <span className="min-w-0 flex-1 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="block">
                      <span className="block text-footnote">
                        <SkeletonText width="56%" />
                      </span>
                      <span className="block text-title-3">
                        <SkeletonText width="40%" />
                      </span>
                    </span>
                  ))}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 surface p-4">
              <span className="min-w-0 flex-1">
                <span className="block text-footnote">
                  <SkeletonText width="24%" />
                </span>
                <span className="block text-title-3">
                  <SkeletonText width="64%" />
                </span>
                <span className="block text-footnote">
                  <SkeletonText width="48%" />
                </span>
              </span>
            </div>
          </div>
          <section aria-hidden="true">
            <div className="mb-2.5 flex items-end justify-between gap-4">
              <span className="section-title">Abzeichen</span>
              <SkeletonLine width={40} height={12} />
            </div>
            <div className="tile-grid grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 px-2 py-4 text-center">
                  <span className="skeleton h-14 w-14 rounded-full" />
                  <span className="w-full text-footnote">
                    <SkeletonText width="64%" />
                  </span>
                  <span className="w-full text-caption">
                    <SkeletonText width="40%" />
                  </span>
                </div>
              ))}
            </div>
          </section>
      </div>
    </div>
  );
}
