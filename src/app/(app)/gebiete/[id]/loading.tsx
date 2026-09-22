import { SkeletonLine } from "@/components/ui";

/** Platzhalter der Gebiets-Detailseite. */
export default function LoadingTerritory() {
  return (
    <div className="mx-auto max-w-4xl" aria-busy="true" aria-label="Gebiet wird geladen">
      <SkeletonLine width={110} height={13} className="mb-3" />
      <div className="mb-5 space-y-2">
        <SkeletonLine width="50%" height={28} />
        <SkeletonLine width="30%" height={13} />
      </div>

      <div className="card mb-4 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <SkeletonLine width="70%" height={10} />
            <SkeletonLine width="45%" height={20} />
          </div>
        ))}
      </div>

      <div className="card mb-4 space-y-3 p-4">
        <SkeletonLine width="35%" height={13} />
        <SkeletonLine height={240} radius={15} />
      </div>

      <div className="card space-y-3 p-4">
        <SkeletonLine width="25%" height={13} />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-1.5 border-t pt-2.5" style={{ borderColor: "var(--line)" }}>
            <SkeletonLine width={`${60 - i * 6}%`} height={13} />
            <SkeletonLine width={`${35 - i * 3}%`} height={10} />
          </div>
        ))}
      </div>
    </div>
  );
}
