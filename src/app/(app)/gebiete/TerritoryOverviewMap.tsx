"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AreaMap, TONE_LEGEND, type AreaTone, type MapArea } from "@/components/AreaMap";
import { plural } from "@/components/ui";
import { IconChevronDown, IconMap } from "@/components/icons";
import type { Shape } from "@/lib/geo/shape";

export interface OverviewTerritory {
  id: number;
  name: string;
  area: Shape;
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
  territories,
}: {
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

  // Stabil halten: die Karte loest bei neuen Daten Ueberschneidungen neu auf.
  const areas: MapArea[] = useMemo(
    () =>
      shown.map((t) => ({
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
      })),
    [shown],
  );

  if (territories.length === 0) return null;

  return (
    <div className="card mb-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <IconMap className="h-4 w-4 shrink-0 text-tint" />
        <p className="flex-1 text-[14px] font-semibold">
          Karte{" "}
          <span className="muted font-normal tabular-nums">
            ({shown.length}
            {shown.length !== territories.length && ` von ${territories.length}`})
          </span>
        </p>
        {open && people.length > 1 && (
          <select
            className="select w-auto px-2.5 py-1 text-[12px]"
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
          className="icon-btn shrink-0"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Karte ausblenden" : "Karte anzeigen"}
        >
          <IconChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3">
          <div
            className="overflow-hidden rounded-[var(--r-md)] border"
            style={{ borderColor: "var(--line)" }}
          >
            <AreaMap
              areas={areas}
              legend={[
                { color: TONE_LEGEND.brand, label: "in Arbeit" },
                { color: TONE_LEGEND.success, label: "fertig" },
                { color: TONE_LEGEND.warn, label: "pausiert" },
                { color: TONE_LEGEND.muted, label: "offen" },
              ]}
              className="h-[40vh] min-h-[240px] w-full"
              onSelect={(id) => router.push(`/gebiete/${id}`)}
            />
          </div>
        </div>
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
