import { SkeletonHeader, SkeletonList, SkeletonSegmented } from "@/components/ui";

/** Platzhalter der Provisionsliste - Sparte, Filter, dann je Tarif Name und Betrag. */
export default function LoadingCommissions() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Provisionen werden geladen">
      <SkeletonHeader title="Provisionen" back={{ href: "/profil", label: "Profil", mobileOnly: true }} />
      <SkeletonSegmented className="mb-3" />
      <SkeletonList rows={8} subtitle />
    </div>
  );
}
