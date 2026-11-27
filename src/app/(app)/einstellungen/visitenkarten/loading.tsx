import { SkeletonHeader, SkeletonList } from "@/components/ui";

const BACK = { href: "/profil", label: "Profil", mobileOnly: true };

/** Platzhalter der Kartenuebersicht - eine Liste mit Bildern. */
export default function LoadingTeamCards() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Visitenkarten werden geladen">
      <SkeletonHeader title="Visitenkarten" back={BACK} />
      <SkeletonList rows={6} />
    </div>
  );
}
