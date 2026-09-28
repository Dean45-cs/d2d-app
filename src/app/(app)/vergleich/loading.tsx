import { SkeletonLine, SkeletonRows } from "@/components/ui";

/** Platzhalter der Rangliste - eigener Platz oben, darunter die Liste. */
export default function LoadingCompare() {
  return (
    <div className="mx-auto max-w-5xl" aria-busy="true" aria-label="Vergleich wird geladen">
      <div className="mb-5 space-y-2">
        <SkeletonLine width="30%" height={28} />
        <SkeletonLine width="45%" height={13} />
      </div>
      <SkeletonLine width="100%" height={132} radius={16} className="mb-4" />
      <SkeletonRows rows={5} />
    </div>
  );
}
