import { SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter der Rangliste - Zeitraum, eigener Platz, Liste. */
export default function LoadingRanking() {
  return (
    <div className="page" aria-busy="true" aria-label="Rangliste wird geladen">
      <SkeletonHeader />
      <div className="skeleton mb-6 h-8 max-w-md rounded-full" aria-hidden="true" />
      <div className="max-w-2xl space-y-6">
        <div className="skeleton h-28 rounded-xl" aria-hidden="true" />
        <SkeletonList rows={6} />
      </div>
    </div>
  );
}
