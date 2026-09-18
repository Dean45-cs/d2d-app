"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AreaMap, type AreaTone, type MapArea } from "@/components/AreaMap";
import { cssColor } from "@/components/map-colors";
import { plural } from "@/components/ui";

export interface OverviewTerritory {
  id: number;
  name: string;
  area: [number, number][];
  status: string;
  assignee: string | null;
  streets: number;
  doors: number;
  units: number;
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

/**
 * Alle gezeichneten Gebiete auf einen Blick: Farbe = Status, Kuerzel = wer
 * dran ist. Zeigt sofort, was noch frei ist und wo jemand zwei Gebiete hat.
 */
export function TerritoryOverviewMap({
  tileUrl,
  territories,
}: {
  tileUrl: string;
  territories: OverviewTerritory[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [person, setPerson] = useState("");

  const people = useMemo(
    () =>
      Array.from(new Set(territories.map((t) => t.assignee).filter((a): a is string => !!a))).sort(
        (a, b) => a.localeCompare(b, "de-DE"),
      ),
    [territories],
  );

  const shown = useMemo(
    () =>
      person === ""
        ? territories
        : person === "-"
          ? territories.filter((t) => !t.assignee)
          : territories.filter((t) => t.assignee === person),
    [territories, person],
  );

  if (territories.length === 0) return null;

  const areas: MapArea[] = shown.map((t) => ({
    id: t.id,
    name: t.name,
    area: t.area,
    tone: TONES[t.status] ?? "muted",
    badge: initials(t.assignee),
    hint: [
      STATUS_LABEL[t.status] ?? t.status,
      plural(t.streets, "Straße", "Straßen"),
      t.units > 0 ? `${t.doors} von ${t.units} Türen` : `${t.doors} Türen erfasst`,
      t.assignee ?? "nicht zugeteilt",
    ].join(" · "),
  }));

  return (
    <div className="card mb-4 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Gebietskarte ({shown.length}
          {shown.length !== territories.length && ` von ${territories.length}`})
        </p>
        <div className="flex items-center gap-3">
          {open && people.length > 1 && (
            <select
              className="select w-auto px-2 py-1 text-xs"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              aria-label="Karte nach Mitarbeiter filtern"
            >
              <option value="">alle Gebiete</option>
              <option value="-">nicht zugeteilt</option>
              {people.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="muted text-xs font-semibold underline"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "ausblenden" : "anzeigen"}
          </button>
        </div>
      </div>

      {open && (
        <>
          <AreaMap
            tileUrl={tileUrl}
            areas={areas}
            legend={[
              { color: cssColor("--brand-600", "#0f5cab"), label: "in Arbeit" },
              { color: cssColor("--energy-600", "#059450"), label: "fertig" },
              { color: cssColor("--gas-500", "#f59e0b"), label: "pausiert" },
              { color: cssColor("--ink-muted", "#5b6b82"), label: "offen" },
            ]}
            className="h-[40vh] min-h-[240px] w-full"
            onSelect={(id) => router.push(`/gebiete/${id}`)}
          />
          <p className="muted mt-2 text-xs">
            Auf eine Fläche tippen, um das Gebiet zu öffnen. Das Kürzel zeigt, wer dran ist.
          </p>
        </>
      )}
    </div>
  );
}

/** „Alex Krüger“ -> „AK“, niemand -> „–“ */
function initials(name: string | null): string {
  if (!name) return "–";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toLocaleUpperCase("de-DE") ?? "").join("") || "–";
}
