import { SkeletonHeader, SkeletonList, SkeletonStats } from "@/components/ui";

/** Platzhalter der Gebietsseite - Kennzahlen, Karte, Listen. */
export default function LoadingTerritory() {
  return (
    <div className="page" aria-busy="true" aria-label="Gebiet wird geladen">
      {/* Der Titel ist der Name des Gebiets - den kennt erst die Seite. */}
      <SkeletonHeader back={{ href: "/gebiete", label: "Karte" }} />
      <SkeletonStats />
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start">
        <div className="skeleton h-[52vh] min-h-80 rounded-xl" aria-hidden="true" />
        <div className="space-y-8">
          <SkeletonList rows={2} icon={false} />
          <SkeletonList rows={5} icon="glyph" />
        </div>
      </div>
    </div>
  );
}
