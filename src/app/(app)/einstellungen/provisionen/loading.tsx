import { ListLabel, SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter der Provisionsregeln - Liste, Standard, Ausnahmen, Boni. */
export default function LoadingCommissionSettings() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Provisionsregeln werden geladen">
      <SkeletonHeader title="Provisionsregeln" back={{ href: "/profil", label: "Profil", mobileOnly: true }} />
      <ListLabel>Liste</ListLabel>
      <SkeletonList rows={2} icon="glyph" subtitle />
      <ListLabel>Standard</ListLabel>
      <SkeletonList rows={4} />
      <ListLabel>Ausnahmen</ListLabel>
      <SkeletonList rows={2} />
    </div>
  );
}
