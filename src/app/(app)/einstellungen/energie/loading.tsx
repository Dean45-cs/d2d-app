import { SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter von Energie & Tarif - Bundesschnitt, daneben die Werkzeuge. */
export default function LoadingEnergy() {
  return (
    <div className="page-medium" aria-busy="true" aria-label="Energie & Tarif wird geladen">
      <SkeletonHeader />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-8">
        <SkeletonList rows={4} icon={false} />
        <SkeletonList rows={2} />
      </div>
    </div>
  );
}
