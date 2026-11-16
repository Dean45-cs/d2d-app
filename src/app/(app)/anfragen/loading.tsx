import { SkeletonHeader, SkeletonList, SkeletonSegmented } from "@/components/ui";

/** Platzhalter des Posteingangs - Filter, dann je Anfrage Name und Anliegen. */
export default function LoadingInquiries() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Anfragen werden geladen">
      <SkeletonHeader title="Anfragen" back={{ href: "/profil", label: "Profil", mobileOnly: true }}>
        <SkeletonSegmented />
      </SkeletonHeader>
      <SkeletonList rows={6} icon="glyph" />
    </div>
  );
}
