import { SkeletonHeader, SkeletonList, SkeletonText } from "@/components/ui";

const BACK = { href: "/profil", label: "Profil", mobileOnly: true };

/** Platzhalter der Einladungen - Freigaben und Links, daneben das Team darunter. */
export default function LoadingInvitations() {
  return (
    <div className="page" aria-busy="true" aria-label="Einladungen werden geladen">
      <SkeletonHeader title="Einladungen" back={BACK} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
        <div className="min-w-0">
          <p className="list-label">
            <SkeletonText width="min(28%, 8rem)" />
          </p>
          <SkeletonList rows={3} icon="glyph" />
        </div>
        <div className="min-w-0">
          <p className="list-label">
            <SkeletonText width="min(36%, 8rem)" />
          </p>
          <SkeletonList rows={4} />
        </div>
      </div>
    </div>
  );
}
