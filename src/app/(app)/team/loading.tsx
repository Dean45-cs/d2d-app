import { SkeletonLine, SkeletonRows } from "@/components/ui";

/** Platzhalter der Teamliste - die Kreise stehen fuer die Profilbilder. */
export default function LoadingTeam() {
  return (
    <div className="mx-auto max-w-4xl" aria-busy="true" aria-label="Team wird geladen">
      <div className="mb-5 space-y-2">
        <SkeletonLine width="28%" height={28} />
        <SkeletonLine width="62%" height={13} />
      </div>
      <SkeletonRows rows={4} />
    </div>
  );
}
