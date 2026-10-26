"use client";

import { IconChevronLeft, IconPencil } from "@/components/icons";
import { QueueBadge } from "./TourHeader";

/**
 * Kopf im Mehrfamilienhaus: man ist im Haus und nur dort - zurueck geht es
 * zur Strasse, "Bearbeiten" pflegt Schilder, Haustyp und Sperre. Die
 * Hausnummern der Strasse stehen hier bewusst nicht.
 */
export function BuildingHeader({
  street,
  number,
  detail,
  pendingCount,
  online,
  onBack,
  onEdit,
  onDay,
}: {
  street: string;
  number: string;
  /** "Mehrfamilienhaus · 8 Klingeln · Abschluss am 12.03.2026" */
  detail: string;
  pendingCount: number;
  online: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDay: () => void;
}) {
  return (
    <header className="pb-4 md:pb-0">
      <div className="flex h-11 items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="btn btn-plain -ml-3 min-w-0 px-2"
          aria-label={`Zurück zur ${street}`}
        >
          <IconChevronLeft className="h-5 w-5 shrink-0" />
          <span className="truncate">{street}</span>
        </button>
        <span className="flex-1" />
        <QueueBadge online={online} pendingCount={pendingCount} onClick={onDay} />
        <button type="button" className="btn btn-plain btn-sm -mr-2" onClick={onEdit}>
          <IconPencil className="h-4 w-4" />
          Bearbeiten
        </button>
      </div>
      <h1 className="mt-1 truncate text-large-title">Nr. {number}</h1>
      <p className="mt-1 text-subhead text-ink-2">{detail}</p>
    </header>
  );
}
