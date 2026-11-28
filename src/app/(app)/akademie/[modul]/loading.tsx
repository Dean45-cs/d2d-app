import { SkeletonHeader, SkeletonText } from "@/components/ui";

/** Platzhalter eines Moduls - Titel und Lektionen; der Titel haengt vom Modul ab. */
export default function LoadingAcademyModule() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Modul wird geladen">
      <SkeletonHeader back={{ href: "/akademie", label: "Akademie" }} />
      <p className="text-body" aria-hidden="true">
        <SkeletonText width="82%" />
      </p>
      <div className="mt-6 space-y-8" aria-hidden="true">
        {[0, 1].map((lesson) => (
          <div key={lesson}>
            <p className="section-title mb-2.5">
              <SkeletonText width="48%" />
            </p>
            <div className="surface space-y-3 p-4">
              {["92%", "76%", "84%", "64%"].map((width, line) => (
                <span key={line} className="block text-body">
                  <SkeletonText width={width} />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
