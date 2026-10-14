import { SkeletonLine } from "@/components/ui";

/** Platzhalter der Tuer: Kopf, grosse Nummer, Ergebnisleiste - nichts springt. */
export default function LoadingTour() {
  return (
    <div className="mx-auto max-w-xl" aria-busy="true" aria-label="Klinken wird geladen">
      <div className="space-y-2 pb-4 pt-12">
        <SkeletonLine width="56%" height={32} className="rounded-lg" />
        <SkeletonLine width="40%" height={12} />
      </div>
      <div className="flex flex-col items-center gap-4 py-8">
        <SkeletonLine width={140} height={88} className="rounded-2xl" />
        <SkeletonLine width="48%" height={12} />
      </div>
      <div className="tray glass-strong">
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="skeleton block h-15 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
