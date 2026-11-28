import { ListLabel, SkeletonHeader, SkeletonList, SkeletonText } from "@/components/ui";

/** Platzhalter eines Moduls - Video, Kapitel, das Wichtigste; der Titel haengt vom Modul ab. */
export default function LoadingAcademyModule() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Modul wird geladen">
      <SkeletonHeader back={{ href: "/akademie", label: "Akademie" }} />
      <div className="surface overflow-hidden" aria-hidden="true">
        <span className="skeleton block aspect-video w-full" />
      </div>
      <ListLabel>Kapitel</ListLabel>
      <SkeletonList rows={4} icon={false} subtitle={false} />
      <ListLabel>Das Wichtigste</ListLabel>
      <div className="surface space-y-3 p-4" aria-hidden="true">
        {["88%", "76%", "82%"].map((width) => (
          <span key={width} className="block text-body">
            <SkeletonText width={width} />
          </span>
        ))}
      </div>
    </div>
  );
}
