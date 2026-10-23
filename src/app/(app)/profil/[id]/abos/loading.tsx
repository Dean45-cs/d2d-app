import { SkeletonChips, SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter der Abonnements - Umschalter, dann die Personen. */
export default function LoadingConnections() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Abonnements werden geladen">
      {/* Titel ("Abonniert"/"Abonnenten") und Ruecksprung (Vorname) kennt erst die Seite. */}
      <SkeletonHeader>
        <SkeletonChips widths={[128, 140]} />
      </SkeletonHeader>
      <SkeletonList rows={6} />
    </div>
  );
}
