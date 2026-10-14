import { SkeletonHeader, SkeletonList, SkeletonStats } from "@/components/ui";

/** Platzhalter der Gebietsseite - Kennzahlen, Karte, Listen. */
export default function LoadingTerritory() {
  return (
    <div className="page" aria-busy="true" aria-label="Gebiet wird geladen">
      <SkeletonHeader />
      <SkeletonStats />
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <div className="skeleton h-[52vh] min-h-80 rounded-xl" aria-hidden="true" />
        <div className="space-y-8">
          <SkeletonList rows={2} />
          <SkeletonList rows={5} />
        </div>
      </div>
    </div>
  );
}
