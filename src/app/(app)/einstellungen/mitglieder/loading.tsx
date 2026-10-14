import { SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter der Mitgliederliste - die Kreise stehen fuer die Profilbilder. */
export default function LoadingMembers() {
  return (
    <div className="page" aria-busy="true" aria-label="Mitglieder werden geladen">
      <SkeletonHeader />
      <SkeletonList rows={6} />
    </div>
  );
}
