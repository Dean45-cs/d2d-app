"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AreaMap, type AreaTone, type MapArea } from "@/components/AreaMap";
import { IconChevronDown } from "@/components/icons";
import { plural } from "@/components/ui";
import type { Shape } from "@/lib/geo/shape";

export interface OverviewTerritory {
  id: number;
  name: string;
  area: Shape;
  status: string;
  assignee: string | null;
  streets: number;
  /** "12 von 30 Häusern" */
  progress: string;
}

const TONES: Record<string, AreaTone> = { ACTIVE: "active", DONE: "done", PAUSED: "paused", OPEN: "open" };
const STATUS_LABEL: Record<string, string> = { ACTIVE: "In Arbeit", DONE: "Fertig", PAUSED: "Pausiert", OPEN: "Offen" };

/**
 * Alle gezeichneten Gebiete auf einen Blick: gruen ist in Arbeit, das
 * Kuerzel sagt, wer dran ist. Ein Tipp oeffnet das Gebiet.
 */
export function TerritoryOverviewMap({
  territories,
  className,
}: {
  territories: OverviewTerritory[];
  className?: string;
}) {
  const router = useRouter();
  const [person, setPerson] = useState("");

  const people = useMemo(
    () =>
      Array.from(new Set(territories.map((t) => t.assignee).filter((a): a is string => !!a))).sort((a, b) =>
        a.localeCompare(b, "de-DE"),
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

  // Stabil halten: die Karte loest bei neuen Daten Ueberschneidungen neu auf.
  const areas: MapArea[] = useMemo(
    () =>
      shown.map((t) => ({
        id: t.id,
        name: t.name,
        area: t.area,
        tone: TONES[t.status] ?? "open",
        badge: initials(t.assignee),
        hint: [
          STATUS_LABEL[t.status] ?? t.status,
          plural(t.streets, "Straße", "Straßen"),
          t.progress,
          t.assignee ?? "nicht zugeteilt",
        ].join(" · "),
      })),
    [shown],
  );

  if (territories.length === 0) return null;

  return (
    <AreaMap
      areas={areas}
      className={className}
      legend={[
        { tone: "active", label: "In Arbeit" },
        { tone: "done", label: "Fertig" },
        { tone: "open", label: "Offen" },
        { tone: "paused", label: "Pausiert" },
      ]}
      onSelect={(id) => router.push(`/gebiete/${id}`)}
    >
      {people.length > 1 && (
        <label className="map-chip pointer-events-auto relative pr-8">
          <span className="sr-only">Karte nach Person filtern</span>
          <select
            className="absolute inset-0 cursor-pointer opacity-0"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            <option value="">Alle Gebiete</option>
            <option value="-">Nicht zugeteilt</option>
            {people.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {person === "" ? "Alle Gebiete" : person === "-" ? "Nicht zugeteilt" : person}
          <IconChevronDown className="absolute right-3 h-4 w-4" />
        </label>
      )}
    </AreaMap>
  );
}

/** „Alex Krüger“ -> „AK“, niemand -> „–“ */
function initials(name: string | null): string {
  if (!name) return "–";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toLocaleUpperCase("de-DE") ?? "").join("") || "–";
}
