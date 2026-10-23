import { SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter der Rechte - Personen, daneben die Rechte. */
export default function LoadingPermissions() {
  return (
    <div className="page" aria-busy="true" aria-label="Rechte werden geladen">
      <SkeletonHeader title="Rechte" back={{ href: "/profil", label: "Profil", mobileOnly: true }} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
        <SkeletonList rows={5} />
        <div className="hidden lg:block">
          <SkeletonList rows={6} icon={false} />
        </div>
      </div>
    </div>
  );
}
