import { SkeletonCard, SkeletonLine } from "@/components/ui";

/** Platzhalter der Gebietsuebersicht: Kopf, Karte, Gebietskarten. */
export default function LoadingTerritories() {
  return (
    <div className="mx-auto max-w-5xl" aria-busy="true" aria-label="Gebiete werden geladen">
      <div className="mb-5 space-y-2">
        <SkeletonLine width="42%" height={28} />
        <SkeletonLine width="70%" height={13} />
      </div>

      <div className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <SkeletonLine width="35%" height={13} />
        </div>
        <div className="px-3 pb-3">
          <SkeletonLine height={240} radius={15} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );
}
