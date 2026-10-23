import {
  SegmentedLinks,
  SkeletonChips,
  SkeletonHeader,
  SkeletonList,
  SkeletonSegmented,
  SkeletonText,
} from "@/components/ui";
import { TEAM_VIEWS } from "../views";

/** Platzhalter der Rangliste - Zeitraum, Kennzahl, eigener Platz, Liste. */
export default function LoadingRanking() {
  return (
    <div className="page" aria-busy="true" aria-label="Rangliste wird geladen">
      <SkeletonHeader title="Rangliste">
        <SegmentedLinks ariaLabel="Team" current="rangliste" options={TEAM_VIEWS} className="max-w-md" />
      </SkeletonHeader>
      <SkeletonSegmented className="mb-3 max-w-md" />
      <SkeletonChips widths={[100, 92, 84, 112]} className="mb-6" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
        <div>
          <section className="mb-6 surface p-4" aria-hidden="true">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-footnote font-semibold text-ink-2">Dein Platz</p>
                <p className="text-large-title">
                  <SkeletonText width="min(48%, 7rem)" />
                </p>
              </div>
              <div className="min-w-0 flex-1 text-right">
                <p className="text-footnote">
                  <SkeletonText width="min(56%, 6rem)" />
                </p>
                <p className="text-large-title">
                  <SkeletonText width="min(32%, 4rem)" />
                </p>
              </div>
            </div>
          </section>
          <SkeletonList rows={6} />
        </div>
        <div className="hidden lg:block">
          <SkeletonList rows={3} icon={false} />
        </div>
      </div>
    </div>
  );
}
