import {
  PageHeader,
  SectionHeader,
  SkeletonChips,
  SkeletonPost,
  SkeletonStats,
  SkeletonText,
} from "@/components/ui";

/** Platzhalter des Profils - Person, Kennzahlen, Level, Beitraege. */
export default function LoadingProfile() {
  return (
    <div className="page" aria-busy="true" aria-label="Profil wird geladen">
      {/* Nur die Leiste, wie auf der Seite; Name und Ruecksprung kennt erst die Seite. */}
      {/* Feste Breite: die Mitte der Leiste ist so breit wie ihr Inhalt - Prozent waere dort null. */}
      <PageHeader title={<SkeletonText width={128} />} hideLargeTitle />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-8">
          <div className="flex flex-col items-center rounded-xl bg-surface px-4 py-6 text-center" aria-hidden="true">
            <span className="skeleton h-22 w-22 rounded-full" />
            <span className="mt-3 block w-full text-title-1">
              <SkeletonText width="min(60%, 14rem)" />
            </span>
            <span className="mt-1 block w-full text-subhead">
              <SkeletonText width="min(40%, 9rem)" />
            </span>
            <span className="mt-3 block w-full text-footnote">
              <SkeletonText width="min(44%, 10rem)" />
            </span>
            <span className="mt-1 flex min-h-11 w-full items-center justify-center text-subhead">
              <SkeletonText width="min(56%, 13rem)" />
            </span>
            <span className="skeleton mt-2 h-11 w-32 rounded-full" />
          </div>
          <section>
            <SectionHeader title="Leistung" href="/team/rangliste?range=30" linkLabel="Rangliste" />
            <div className="space-y-4">
              <SkeletonStats count={4} columns={2} />
              <div className="flex items-center gap-4 rounded-xl bg-surface p-4" aria-hidden="true">
                <span className="skeleton h-16 w-16 shrink-0 rounded-full" />
                <span className="min-w-0 flex-1">
                  <span className="block text-footnote">
                    <SkeletonText width="30%" />
                  </span>
                  <span className="block text-title-3">
                    <SkeletonText width="60%" />
                  </span>
                  <span className="block text-footnote">
                    <SkeletonText width="50%" />
                  </span>
                </span>
              </div>
            </div>
          </section>
        </div>
        <div className="min-w-0">
          <SkeletonChips widths={[96, 104, 104]} className="mb-4" />
          <div className="space-y-3">
            {[2, 3, 1].map((lines, i) => (
              <SkeletonPost key={i} lines={lines} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
