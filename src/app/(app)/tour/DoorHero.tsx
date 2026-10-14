"use client";

import { useRef, type ReactNode } from "react";
import { IconChevronLeft, IconChevronRight, IconKeypad } from "@/components/icons";

export interface DoorStatusLine {
  /** Kleines Zeichen vor dem Satz (Ergebnis, Sperre, Versuch). */
  glyph?: ReactNode;
  text: string;
}

/**
 * Die Hausnummer als Held: gross, rund, unverwechselbar - auch in der
 * Sonne. Darueber der Strassenname klein, darunter in einem Satz, was an
 * dieser Tuer los war. Wischen oder die Pfeile springen zum Nachbarhaus,
 * ein Tipp auf die Nummer oeffnet das Haus.
 */
export function DoorHero({
  number,
  bell,
  status,
  detail,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onOpen,
  onType,
  empty,
}: {
  number: string | null;
  /** Gewaehlte Klingel im Mehrfamilienhaus. */
  bell?: { label: string; floor: string } | null;
  status: DoorStatusLine | null;
  /** Zweite Zeile, etwa "Mehrfamilienhaus · 3 von 8 Klingeln". */
  detail?: string | null;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpen: () => void;
  /** Hausnummer eintippen (Strassen ohne Liste, fehlende Nummer). */
  onType: () => void;
  /** Statt einer Nummer: Strasse erledigt, keine Nummern, ... */
  empty?: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);

  function onPointerDown(event: React.PointerEvent) {
    start.current = { x: event.clientX, y: event.clientY };
  }
  function onPointerUp(event: React.PointerEvent) {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 48) return;
    if (dx < 0 && canNext) onNext();
    if (dx > 0 && canPrev) onPrev();
  }

  return (
    <section
      className="flex select-none flex-col items-center py-2 text-center"
      aria-label="Aktuelle Tür"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (start.current = null)}
    >
      <div className="grid w-full grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
        <button
          type="button"
          className="icon-btn icon-btn-fill"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Vorige Hausnummer"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>

        {number ? (
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 rounded-2xl px-2"
            aria-label={`Hausnummer ${number}${bell ? `, Klingel ${bell.label}` : ""} – Haus öffnen`}
          >
            <span key={number} className="kpi number-in block truncate text-hero">
              {number}
            </span>
          </button>
        ) : (
          <div className="min-w-0 py-4">{empty}</div>
        )}

        <button
          type="button"
          className="icon-btn icon-btn-fill"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Nächste Hausnummer"
        >
          <IconChevronRight className="h-5 w-5" />
        </button>
      </div>

      {number && bell && (
        <p className="mt-1 max-w-full truncate text-title-3">
          {bell.label}
          {bell.floor && <span className="font-normal text-ink-2"> · {bell.floor}</span>}
        </p>
      )}
      {number && status && (
        <p className="mt-2 flex max-w-full items-center gap-2 text-subhead text-ink-2">
          {status.glyph}
          <span className="truncate">{status.text}</span>
        </p>
      )}
      {number && detail && <p className="mt-1 max-w-full truncate text-footnote text-muted">{detail}</p>}

      <button type="button" onClick={onType} className="btn btn-plain btn-sm mt-2">
        <IconKeypad className="h-4 w-4" />
        Nummer eingeben
      </button>
    </section>
  );
}
