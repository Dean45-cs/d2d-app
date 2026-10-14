import { SkeletonLine } from "@/components/ui";

/** Platzhalter des Profils - Person, Kennzahlen, Level, Beitraege. */
export default function LoadingProfile() {
  return (
    <div className="page" aria-busy="true" aria-label="Profil wird geladen">
      {/* So hoch wie die Werkzeugleiste, damit nichts springt. */}
      <div className="h-7 md:h-5" aria-hidden="true" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start" aria-hidden="true">
        <div className="space-y-8">
          <div className="flex flex-col items-center gap-3 rounded-xl bg-surface px-4 py-6">
            <span className="skeleton h-22 w-22 rounded-full" />
            <SkeletonLine width="56%" height={24} className="rounded-md" />
            <SkeletonLine width="36%" height={12} />
            <SkeletonLine width="48%" height={12} />
            <span className="skeleton mt-2 h-11 w-32 rounded-full" />
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-separator">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2 bg-surface px-4 py-4">
                  <SkeletonLine width="50%" height={10} />
                  <SkeletonLine width="40%" height={24} className="rounded-md" />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 rounded-xl bg-surface p-4">
              <span className="skeleton h-16 w-16 shrink-0 rounded-full" />
              <span className="min-w-0 flex-1 space-y-2">
                <SkeletonLine width="30%" height={10} />
                <SkeletonLine width="60%" height={16} />
                <SkeletonLine width="50%" height={10} />
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex gap-2">
            {[96, 104, 104].map((width, i) => (
              <SkeletonLine key={i} width={width} height={36} />
            ))}
          </div>
          {[2, 3, 1].map((lines, i) => (
            <div key={i} className="space-y-3 rounded-xl bg-surface p-4">
              <div className="flex items-center gap-3">
                <span className="skeleton h-10 w-10 rounded-full" />
                <SkeletonLine width="40%" height={12} />
              </div>
              {Array.from({ length: lines }, (_, j) => (
                <SkeletonLine key={j} width={`${90 - j * 15}%`} height={10} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
