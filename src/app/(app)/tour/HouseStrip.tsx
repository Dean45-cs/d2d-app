"use client";

import { useEffect, useRef } from "react";
import { IconBan, IconBell, IconCalendar, IconCheck } from "@/components/icons";

export type ChipState = "open" | "retry" | "done" | "sale" | "appointment" | "blocked";

export interface HouseChip {
  id: number;
  number: string;
  state: ChipState;
  /** Kleiner Zusatz: "2/3" Versuche, "3/8" Klingeln. */
  suffix?: string;
  /** Mehrfamilienhaus ohne Schilder - Klingelzeichen. */
  needsBells?: boolean;
  label: string;
}

/**
 * Alle Hausnummern der Strasse als Leiste zum Wischen. Form statt Farbe:
 * erledigt ist durchgestrichen, ein Abschluss traegt das volle Haekchen,
 * gesperrt das Verbotszeichen, ein Termin den Kalender.
 */
export function HouseStrip({
  chips,
  current,
  openCount,
  onlyOpen,
  onToggleOpen,
  onPick,
}: {
  chips: HouseChip[];
  current: string | null;
  openCount: number;
  onlyOpen: boolean;
  onToggleOpen: () => void;
  onPick: (number: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  // Die aktuelle Nummer bleibt im Blick, auch wenn die Leiste lang ist.
  useEffect(() => {
    const node = scroller.current?.querySelector<HTMLElement>("[aria-pressed=true]");
    node?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [current]);

  const total = chips.length;
  return (
    <section aria-label="Hausnummern der Straße">
      <div className="mb-2 flex min-h-11 items-center justify-between px-1">
        <p className="text-footnote font-semibold text-ink-2">
          {openCount === 0 ? `Alle ${total} erledigt` : `${openCount} von ${total} offen`}
        </p>
        <button type="button" className="chip min-h-8" aria-pressed={onlyOpen} onClick={onToggleOpen}>
          Nur offene
        </button>
      </div>
      <div ref={scroller} className="chips -mx-4 px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        {chips.map((chip) => {
          const active = current !== null && chip.number === current;
          const done = chip.state === "done" || chip.state === "blocked";
          return (
            <button
              key={chip.id}
              type="button"
              className="chip min-w-11 justify-center px-4"
              aria-pressed={active}
              aria-label={chip.label}
              title={chip.label}
              onClick={() => onPick(chip.number)}
            >
              {chip.state === "sale" && (
                <span className="glyph glyph-result glyph-round h-4 w-4">
                  <IconCheck className="h-2.5 w-2.5" />
                </span>
              )}
              {chip.state === "appointment" && <IconCalendar className="h-4 w-4" />}
              {chip.state === "blocked" && <IconBan className="h-4 w-4 text-danger" />}
              {chip.needsBells && <IconBell className="h-4 w-4 text-muted" />}
              <span className={done && !active ? "text-muted line-through" : ""}>{chip.number}</span>
              {chip.suffix && <span className="text-caption font-normal text-muted">{chip.suffix}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
