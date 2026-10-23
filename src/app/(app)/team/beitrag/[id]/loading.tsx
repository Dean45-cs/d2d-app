import { SkeletonHeader, SkeletonPost, SkeletonText } from "@/components/ui";

/** Platzhalter eines Beitrags - der Beitrag, darunter die Kommentare. */
export default function LoadingPost() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Beitrag wird geladen">
      {/* "Beitrag" oder "Abschluss" - das steht erst im Beitrag. */}
      <SkeletonHeader back={{ href: "/team", label: "Team" }} subtitle={false} />
      <SkeletonPost lines={2} />
      <div className="mt-3 space-y-4 px-4" aria-hidden="true">
        {[2, 1].map((lines, i) => (
          <div key={i} className="flex gap-3">
            <span className="skeleton h-8 w-8 shrink-0 rounded-full" />
            <span className="min-w-0 flex-1">
              <span className="block text-subhead">
                <SkeletonText width="min(32%, 8rem)" />
              </span>
              {Array.from({ length: lines }, (_, j) => (
                <span key={j} className="block text-subhead">
                  <SkeletonText width={j === lines - 1 ? "64%" : "88%"} />
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
