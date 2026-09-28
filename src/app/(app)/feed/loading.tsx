import { SkeletonCard, SkeletonLine } from "@/components/ui";

/** Platzhalter des Feeds - Kopf, Schreibfeld und drei Beitraege. */
export default function LoadingFeed() {
  return (
    <div className="mx-auto max-w-5xl lg:pr-[324px]" aria-busy="true" aria-label="Feed wird geladen">
      <div className="mb-5 space-y-2">
        <SkeletonLine width="22%" height={28} />
        <SkeletonLine width="58%" height={13} />
      </div>
      <div className="space-y-3">
        <SkeletonCard lines={1} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );
}
