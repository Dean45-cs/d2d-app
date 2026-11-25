import { ListLabel, SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter der Raenge - vier Zeilen von oben nach unten. */
export default function LoadingRankSettings() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Ränge werden geladen">
      <SkeletonHeader title="Ränge" back={{ href: "/profil", label: "Profil", mobileOnly: true }} />
      <ListLabel>Von oben nach unten</ListLabel>
      <SkeletonList rows={4} subtitle />
    </div>
  );
}
