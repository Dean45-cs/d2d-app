import { ListLabel, SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter der Einfuehrung - die Videoflaeche, darunter die Kapitel. */
export default function LoadingIntro() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Einführung wird geladen">
      <SkeletonHeader title="Einführung" back={{ href: "/profil", label: "Profil", mobileOnly: true }} />
      <div className="surface overflow-hidden" aria-hidden="true">
        <span className="skeleton block aspect-video w-full" />
      </div>
      <ListLabel>Kapitel</ListLabel>
      <SkeletonList rows={5} icon={false} />
    </div>
  );
}
