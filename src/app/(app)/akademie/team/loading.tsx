import { ListLabel, SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter des Team-Stands - Module, dann die Personen. */
export default function LoadingAcademyTeam() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Stand des Teams wird geladen">
      <SkeletonHeader title="Stand des Teams" back={{ href: "/akademie", label: "Akademie" }} />
      <ListLabel>Module</ListLabel>
      <SkeletonList rows={6} icon="glyph" subtitle={false} />
      <ListLabel>Personen</ListLabel>
      <SkeletonList rows={5} />
    </div>
  );
}
