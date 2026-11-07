import { SkeletonHeader, SkeletonList, SkeletonSegmented } from "@/components/ui";

/** Platzhalter der Personen - je Person Bild, Name und Anteil. */
export default function LoadingCommissionStructure() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Personen werden geladen">
      <SkeletonHeader title="Provisionen" back={{ href: "/profil", label: "Profil", mobileOnly: true }}>
        <SkeletonSegmented />
      </SkeletonHeader>
      <SkeletonList rows={6} icon subtitle />
    </div>
  );
}
