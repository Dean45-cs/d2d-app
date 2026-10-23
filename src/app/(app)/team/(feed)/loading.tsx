import {
  ListLabel,
  SegmentedLinks,
  SkeletonChips,
  SkeletonHeader,
  SkeletonList,
  SkeletonPost,
  SkeletonText,
} from "@/components/ui";
import { TEAM_VIEWS } from "../views";

/** Platzhalter des Feeds - Segmentleiste, Filter, Schreibfeld, Beitraege, rechts die Woche. */
export default function LoadingTeam() {
  return (
    <div className="page" aria-busy="true" aria-label="Team wird geladen">
      <SkeletonHeader title="Team">
        <SegmentedLinks ariaLabel="Team" current="feed" options={TEAM_VIEWS} className="max-w-md" />
      </SkeletonHeader>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
        <div className="min-w-0">
          <SkeletonChips widths={[64, 108]} className="mb-4" />
          <div className="mb-4 flex items-center gap-3 surface p-4" aria-hidden="true">
            <span className="skeleton h-9 w-9 shrink-0 rounded-full" />
            <span className="flex min-h-11 flex-1 items-center text-body">
              <SkeletonText width="min(48%, 12rem)" />
            </span>
          </div>
          <div className="space-y-3">
            {[1, 3, 2].map((lines, i) => (
              <SkeletonPost key={i} lines={lines} />
            ))}
          </div>
        </div>
        <aside className="hidden space-y-8 lg:block">
          <section>
            <ListLabel>Diese Woche</ListLabel>
            <SkeletonList rows={5} />
          </section>
        </aside>
      </div>
    </div>
  );
}
