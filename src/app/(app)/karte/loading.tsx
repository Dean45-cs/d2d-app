import { SegmentedLinks, SkeletonHeader, SkeletonList, SkeletonStats, SkeletonText } from "@/components/ui";
import { MAP_VIEWS } from "../gebiete/views";

/** Platzhalter der Preise - Karte, Kennzahlen, teuerste Orte. */
export default function LoadingPrices() {
  return (
    <div className="page" aria-busy="true" aria-label="Preise werden geladen">
      <SkeletonHeader title="Karte">
        <SegmentedLinks ariaLabel="Ansicht der Karte" current="preise" options={MAP_VIEWS} className="max-w-xs" />
      </SkeletonHeader>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
        <div className="skeleton h-[56vh] min-h-80 rounded-xl lg:h-[calc(100dvh-220px)]" aria-hidden="true" />
        <div className="space-y-8">
          <SkeletonStats count={2} columns={2} />
          <section>
            <p className="list-label">
              <SkeletonText width="min(44%, 12rem)" />
            </p>
            <SkeletonList rows={6} />
          </section>
        </div>
      </div>
    </div>
  );
}
