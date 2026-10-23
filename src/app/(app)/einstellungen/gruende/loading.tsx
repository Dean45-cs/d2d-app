import { SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter der Ablehnungsgruende - je Grund sein Zeichen und Name. */
export default function LoadingReasons() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Ablehnungsgründe werden geladen">
      <SkeletonHeader title="Ablehnungsgründe" back={{ href: "/profil", label: "Profil", mobileOnly: true }} />
      <SkeletonList rows={6} icon="glyph" subtitle={false} />
    </div>
  );
}
