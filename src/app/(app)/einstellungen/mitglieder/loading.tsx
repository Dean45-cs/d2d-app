import { SkeletonHeader, SkeletonList, SkeletonSegmented, SkeletonText } from "@/components/ui";

/** Platzhalter der Mitgliederliste - die Kreise stehen fuer die Profilbilder. */
export default function LoadingMembers() {
  return (
    <div className="page" aria-busy="true" aria-label="Mitglieder werden geladen">
      <SkeletonHeader title="Mitglieder" back={{ href: "/profil", label: "Profil", mobileOnly: true }}>
        <SkeletonSegmented className="max-w-xs" />
      </SkeletonHeader>
      <p className="list-label">
        <SkeletonText width="min(16%, 4rem)" />
      </p>
      <SkeletonList rows={6} />
    </div>
  );
}
