import { SkeletonHeader, SkeletonList, SkeletonSegmented, SkeletonText } from "@/components/ui";

/** Platzhalter der Termine - Filter, dann Tage mit ihren Terminen. */
export default function LoadingAppointments() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Termine werden geladen">
      {/* "Termine" oder "Meine Termine" haengt an den Rechten - den Titel kennt erst die Seite. */}
      <SkeletonHeader>
        <SkeletonSegmented />
      </SkeletonHeader>
      <div className="space-y-6">
        {[3, 2].map((rows, i) => (
          <section key={i}>
            <p className="list-label">
              <SkeletonText width="min(24%, 7rem)" />
            </p>
            <SkeletonList rows={rows} icon="glyph" />
          </section>
        ))}
      </div>
    </div>
  );
}
