import { SkeletonLine } from "@/components/ui";

/**
 * Platzhalter, solange Gebiete, Strassen und Klingeln geladen werden.
 *
 * Die Kacheln stehen schon dort, wo gleich die Zahlen stehen - die Seite
 * springt beim Eintreffen der Daten also nicht.
 */
export default function LoadingTour() {
  return (
    <div className="mx-auto max-w-2xl space-y-3" aria-busy="true" aria-label="Tour wird geladen">
      <div
        className="card grid grid-cols-3 divide-x overflow-hidden"
        style={{ borderColor: "var(--line)" }}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 px-3 py-4" style={{ borderColor: "var(--line)" }}>
            <SkeletonLine width="50%" height={22} className="mx-auto" />
            <SkeletonLine width="80%" height={10} className="mx-auto" />
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="skeleton h-10 w-10 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 space-y-2">
            <SkeletonLine width="55%" height={15} />
            <SkeletonLine width="35%" height={11} />
          </span>
        </div>
        <div className="space-y-3 border-t px-4 py-4" style={{ borderColor: "var(--line)" }}>
          <SkeletonLine width="30%" height={11} />
          <SkeletonLine height={44} radius={12} />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 9 }, (_, i) => (
              <SkeletonLine key={i} width={52} height={30} radius={8} />
            ))}
          </div>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <SkeletonLine width="40%" height={11} />
        <SkeletonLine height={34} className="rounded-full" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <SkeletonLine key={i} height={92} radius={15} />
          ))}
        </div>
        <SkeletonLine height={54} radius={15} />
      </div>
    </div>
  );
}
