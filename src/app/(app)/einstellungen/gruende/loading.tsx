import { SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter der Ablehnungsgruende. */
export default function LoadingReasons() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Ablehnungsgründe werden geladen">
      <SkeletonHeader />
      <SkeletonList rows={6} />
    </div>
  );
}
