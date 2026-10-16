"use client";

import { useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { IconCalendar, IconChevronRight, IconPhone } from "@/components/icons";
import { parseSlot, slotLabel, slotOverdue } from "@/lib/appointments";
import type { AppointmentRow } from "@/lib/queries";

/** Die Termine bleiben erreichbar, ohne die aktuelle Tuer zu verdraengen. */
export function TourAppointments({
  appointments,
  now,
  onPick,
}: {
  /** Bereits auf heute und ueberfaellige Termine begrenzt. */
  appointments: AppointmentRow[];
  now: Date | null;
  onPick: (item: AppointmentRow) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!now || appointments.length === 0) return null;

  const sorted = [...appointments].sort((a, b) => {
    const aTime = parseSlot(a.follow_up_at)?.getTime() ?? Infinity;
    const bTime = parseSlot(b.follow_up_at)?.getTime() ?? Infinity;
    return aTime - bTime || a.id - b.id;
  });
  const overdueCount = sorted.filter((item) => slotOverdue(item.follow_up_at, now)).length;
  const next = sorted.find((item) => !slotOverdue(item.follow_up_at, now));
  const nextLabel = next ? slotLabel(next.follow_up_at, now) : null;
  const summary = [
    nextLabel && `Nächster Termin · ${nextLabel}`,
    overdueCount > 0 && `${overdueCount} überfällig`,
  ].filter(Boolean).join(" · ");

  function pick(item: AppointmentRow) {
    setOpen(false);
    onPick(item);
  }

  return (
    <>
      <button
        type="button"
        className="cell cell-tap rounded-xl bg-surface"
        onClick={() => setOpen(true)}
        aria-label={`${summary} – Termine öffnen`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="glyph glyph-round">
          <IconCalendar className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-caption text-muted">
            {next ? "Nächster Termin" : "Termine nachholen"}
          </span>
          <span className={`block text-subhead font-semibold ${next ? "" : "text-danger"}`}>
            {nextLabel ?? `${overdueCount} überfällig`}
          </span>
        </span>
        {next && overdueCount > 0 && (
          <span className="shrink-0 text-right text-caption font-semibold text-danger">
            <span className="block">{overdueCount}</span>
            <span className="block">überfällig</span>
          </span>
        )}
        <IconChevronRight className="cell-chevron" />
      </button>

      {open && (
        <Sheet
          title="Termine im Blick"
          subtitle="Heute und noch offen"
          onClose={() => setOpen(false)}
          footer={
            <Link href="/termine" className="btn btn-secondary btn-block" onClick={() => setOpen(false)}>
              Alle Termine öffnen
              <IconChevronRight className="h-4 w-4" />
            </Link>
          }
        >
          <ul className="list" aria-label="Heutige und überfällige Termine">
            {sorted.map((item) => {
              const late = slotOverdue(item.follow_up_at, now);
              const phone = item.contact_phone.replace(/[^+\d]/g, "");
              const address = [
                `${item.street_name ?? ""} ${item.house_number}`.trim(),
                item.doorbell_label,
              ].filter(Boolean).join(" · ");

              return (
                <li key={item.id} className="cell pr-2">
                  <button
                    type="button"
                    className="min-h-11 min-w-0 flex-1 rounded-lg py-1 text-left"
                    onClick={() => pick(item)}
                    aria-label={`${item.contact_name || "Termin"}, ${address}, ${slotLabel(item.follow_up_at, now)}${late ? ", überfällig" : ""} – öffnen`}
                  >
                    <span className={`block text-caption font-semibold ${late ? "text-danger" : "text-accent-ink"}`}>
                      {slotLabel(item.follow_up_at, now)}{late && " · Überfällig"}
                    </span>
                    <span className="block break-words text-body">{item.contact_name || "Termin"}</span>
                    <span className="block break-words text-footnote text-muted">{address}</span>
                  </button>
                  {phone && (
                    <a
                      href={`tel:${phone}`}
                      className="icon-btn icon-btn-fill shrink-0"
                      aria-label={`${item.contact_name || "Kontakt"} anrufen`}
                    >
                      <IconPhone className="h-5 w-5" />
                    </a>
                  )}
                  <IconChevronRight className="cell-chevron" />
                </li>
              );
            })}
          </ul>
        </Sheet>
      )}
    </>
  );
}
