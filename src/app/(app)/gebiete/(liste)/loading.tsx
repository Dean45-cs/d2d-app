import { SegmentedLinks, SkeletonHeader, SkeletonList } from "@/components/ui";
import { MAP_VIEWS } from "../views";

/** Platzhalter der Gebiete - Karte, daneben die Liste mit Fortschrittsringen. */
export default function LoadingTerritories() {
  return (
    <div className="page" aria-busy="true" aria-label="Gebiete werden geladen">
      <SkeletonHeader title="Karte">
        <SegmentedLinks ariaLabel="Ansicht der Karte" current="gebiete" options={MAP_VIEWS} className="max-w-xs" />
      </SkeletonHeader>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
        <div
          className="skeleton h-[44vh] min-h-64 rounded-xl lg:col-start-2 lg:h-[calc(100dvh-220px)]"
          aria-hidden="true"
        />
        <div className="lg:col-start-1 lg:row-start-1">
          <SkeletonList rows={6} icon="ring" rowClassName="min-h-16" />
        </div>
      </div>
    </div>
  );
}
