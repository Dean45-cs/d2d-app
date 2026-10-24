import { SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter der Visitenkarte - die Flaeche mit dem QR-Code, darunter die Einstellungen. */
export default function LoadingBusinessCard() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Visitenkarte wird geladen">
      <SkeletonHeader title="Visitenkarte" subtitle={false} back={{ href: "/profil", label: "Profil", mobileOnly: true }} />
      <div className="surface flex flex-col items-center p-6">
        <span className="skeleton block rounded-xl" style={{ width: 232, height: 232 }} aria-hidden="true" />
      </div>
      <div className="mt-4">
        <SkeletonList rows={2} icon="glyph" subtitle={false} />
      </div>
    </div>
  );
}
