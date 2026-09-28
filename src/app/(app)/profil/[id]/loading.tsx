import { SkeletonCard, SkeletonLine } from "@/components/ui";

/** Platzhalter des Profils - Titelbild, Kennzahlen, Beitraege. */
export default function LoadingProfile() {
  return (
    <div className="mx-auto max-w-2xl" aria-busy="true" aria-label="Profil wird geladen">
      <SkeletonLine width="100%" height={250} radius={16} className="mb-4" />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonLine key={i} width="100%" height={84} radius={16} />
        ))}
      </div>
      <SkeletonCard lines={3} />
    </div>
  );
}
