import {
  SectionHeader,
  SkeletonHeader,
  SkeletonList,
  SkeletonSegmented,
  SkeletonStats,
  SkeletonText,
} from "@/components/ui";

/** Hoehe je Tag im Verlauf - sieht nach Wochen aus, nicht nach einem Muster. */
const BARS = [38, 62, 24, 80, 54, 12, 0, 46, 70, 30, 88, 58, 20, 66];

/** Platzhalter der Uebersicht: Zeitraum, Kennzahlen, Verlauf, Termine, Listen. */
export default function LoadingStart() {
  return (
    <div className="page" aria-busy="true" aria-label="Zahlen werden geladen">
      {/* Der Titel ist der Gruss mit Namen (oder "Meine Zahlen") - den kennt erst die Seite. */}
      <SkeletonHeader>
        <SkeletonSegmented className="max-w-md" />
      </SkeletonHeader>

      <SkeletonStats size="lg" />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionHeader title="Verlauf" />
          <div className="surface p-4" aria-hidden="true">
            <div className="flex h-[184px] gap-1 pb-6 pr-8">
              {BARS.map((height, i) => (
                <span key={i} className="flex min-w-0 flex-1 items-end justify-center">
                  <span className="skeleton block w-full max-w-2 rounded-full" style={{ height: `${Math.max(height, 4)}%` }} />
                </span>
              ))}
            </div>
          </div>
        </section>

        <section>
          <SectionHeader title="Termine" href="/termine" />
          <SkeletonList rows={3} icon="glyph" />
        </section>

        <section className="lg:col-span-2">
          <SectionHeader title={<SkeletonText width="min(30%, 8rem)" />} />
          <SkeletonList rows={4} />
        </section>

        <section>
          <SectionHeader title="Ablehnungsgründe" />
          <SkeletonList rows={4} icon="glyph" subtitle={false} />
        </section>
      </div>
    </div>
  );
}
