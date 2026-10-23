import { SkeletonHeader, SkeletonList, SkeletonSegmented } from "@/components/ui";

/** Platzhalter der Kundenliste - Filter, dann je Auftrag Vertragsende, Kunde und Adresse. */
export default function LoadingCustomers() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Kunden werden geladen">
      {/* Welche Ansicht offen ist, entscheidet erst die Seite (dort, wo etwas zu tun ist). */}
      <SkeletonHeader title="Kunden" back={{ href: "/profil", label: "Profil", mobileOnly: true }}>
        <SkeletonSegmented />
      </SkeletonHeader>
      <SkeletonList rows={6} icon="glyph" />
    </div>
  );
}
