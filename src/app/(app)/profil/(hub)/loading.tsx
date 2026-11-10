import { SkeletonHeader, SkeletonList, SkeletonText } from "@/components/ui";

/** Platzhalter des Profil-Reiters - man selbst, dann die eigenen Listen und die Einstellungen. */
export default function LoadingProfileHub() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Profil wird geladen">
      <SkeletonHeader title="Profil" subtitle={false} />
      <div className="list" aria-hidden="true">
        <div className="cell min-h-20">
          <span className="skeleton h-14 w-14 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1">
            <span className="block text-title-3">
              <SkeletonText width="min(56%, 12rem)" />
            </span>
            <span className="block text-footnote">
              <SkeletonText width="min(36%, 8rem)" />
            </span>
          </span>
        </div>
      </div>
      {/* Termine und Visitenkarte, dazu "Meine Zahlen" (Vertrieb) bzw. "Kunden" (Teamleitung). */}
      <div className="mt-6">
        <SkeletonList rows={3} icon="glyph" subtitle={false} />
      </div>
      {/* Einstellungen, Tarifrechner, Einfuehrung. */}
      <div className="mt-6">
        <SkeletonList rows={3} icon="glyph" subtitle={false} />
      </div>
    </div>
  );
}
