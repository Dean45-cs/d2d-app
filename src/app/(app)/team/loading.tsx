import { SkeletonHeader, SkeletonLine } from "@/components/ui";

/** Platzhalter des Teams - Kopf, Segmentleiste, Schreibfeld, Beitraege. */
export default function LoadingTeam() {
  return (
    <div className="page" aria-busy="true" aria-label="Team wird geladen">
      <SkeletonHeader />
      <div className="skeleton mb-6 h-8 max-w-md rounded-full" aria-hidden="true" />
      <div className="max-w-2xl space-y-3">
        {[1, 3, 2].map((lines, i) => (
          <div key={i} className="space-y-3 rounded-xl bg-surface p-4" aria-hidden="true">
            <div className="flex items-center gap-3">
              <span className="skeleton h-10 w-10 rounded-full" />
              <SkeletonLine width="40%" height={12} />
            </div>
            {Array.from({ length: lines }, (_, j) => (
              <SkeletonLine key={j} width={`${90 - j * 15}%`} height={10} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
