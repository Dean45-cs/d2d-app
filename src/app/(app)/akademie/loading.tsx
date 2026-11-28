import { ListLabel, SkeletonHeader, SkeletonList, SkeletonText } from "@/components/ui";

/** Platzhalter der Akademie - Fortschritt, Module, rote Linien. */
export default function LoadingAcademy() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Akademie wird geladen">
      <SkeletonHeader title="Akademie" back={{ href: "/profil", label: "Profil", mobileOnly: true }} />
      <div className="surface flex items-center gap-4 p-4" aria-hidden="true">
        <span className="skeleton h-14 w-14 shrink-0 rounded-full" />
        <span className="min-w-0 flex-1">
          <span className="block text-headline">
            <SkeletonText width="60%" />
          </span>
          <span className="block text-footnote">
            <SkeletonText width="44%" />
          </span>
        </span>
      </div>
      <ListLabel>Module</ListLabel>
      <SkeletonList rows={6} icon="glyph" />
    </div>
  );
}
