import { SkeletonHeader, SkeletonList, SkeletonSegmented } from "@/components/ui";

/** Platzhalter des Tarifvergleichs - Sparte, Verbrauch, dann die Vertraege. */
export default function LoadingTariffComparison() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Tarifvergleich wird geladen">
      <SkeletonHeader title="Tarifvergleich" back={{ href: "/profil", label: "Profil", mobileOnly: true }} />
      <SkeletonSegmented className="mb-3" />
      <SkeletonList rows={3} subtitle />
    </div>
  );
}
