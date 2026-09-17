"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AreaMap, type AreaTone, type MapArea } from "@/components/AreaMap";
import { plural } from "@/components/ui";

export interface OverviewTerritory {
  id: number;
  name: string;
  area: [number, number][];
  status: string;
  assignee: string | null;
  streets: number;
}

const TONES: Record<string, AreaTone> = {
  ACTIVE: "brand",
  DONE: "success",
  PAUSED: "warn",
  OPEN: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "In Arbeit",
  DONE: "Fertig",
  PAUSED: "Pausiert",
  OPEN: "Offen",
};

/** Alle gezeichneten Gebiete auf einen Blick - zeigt sofort, was noch frei ist. */
export function TerritoryOverviewMap({
  tileUrl,
  territories,
}: {
  tileUrl: string;
  territories: OverviewTerritory[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  if (territories.length === 0) return null;

  const areas: MapArea[] = territories.map((t) => ({
    id: t.id,
    name: t.name,
    area: t.area,
    tone: TONES[t.status] ?? "muted",
    hint: `${STATUS_LABEL[t.status] ?? t.status} · ${plural(t.streets, "Straße", "Straßen")} · ${
      t.assignee ?? "nicht zugeteilt"
    }`,
  }));

  return (
    <div className="card mb-4 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Gebietskarte ({territories.length})</p>
        <button
          type="button"
          className="muted text-xs font-semibold underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "ausblenden" : "anzeigen"}
        </button>
      </div>

      {open && (
        <>
          <AreaMap
            tileUrl={tileUrl}
            areas={areas}
            className="h-[40vh] min-h-[240px] w-full"
            onSelect={(id) => router.push(`/gebiete/${id}`)}
          />
          <p className="muted mt-2 text-xs">
            Auf eine Fläche tippen, um das Gebiet zu öffnen. Farbe = Status: blau in Arbeit,
            grün fertig, orange pausiert, grau offen.
          </p>
        </>
      )}
    </div>
  );
}
