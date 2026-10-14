import { SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter der Karte - Segmentleiste, Liste, Karte. */
export default function LoadingTerritories() {
  return (
    <div className="page" aria-busy="true" aria-label="Gebiete werden geladen">
      <SkeletonHeader />
      <div className="skeleton mb-6 h-8 max-w-xs rounded-full" aria-hidden="true" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <div className="skeleton h-[44vh] min-h-64 rounded-xl lg:col-start-2 lg:h-[calc(100dvh-220px)]" aria-hidden="true" />
        <div className="lg:col-start-1 lg:row-start-1">
          <SkeletonList rows={6} />
        </div>
      </div>
    </div>
  );
}
