"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppointmentRow } from "@/lib/queries";
import { Avatar, Cell, EmptyState, ListLabel, PageHeader, Segmented, SkeletonList } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { IconCalendar, IconCheck, IconDoor, IconNavigate, IconPhone, IconUndo } from "@/components/icons";
import { routeUrl } from "@/lib/map";
import { parseSlot, slotDate, slotLabel, slotOverdue, toSlot } from "@/lib/appointments";
import { fetchWithTimeout } from "@/lib/offline-queue";

type View = "open" | "done";

/**
 * Vereinbarte Termine - der Rueckweg des Tages. Ueberfaellige stehen oben,
 * ein Tipp hakt ab (mit "Rückgängig"), die Zeile oeffnet Anruf, Route und
 * die Tuer selbst.
 */
export function AppointmentList({
  appointments,
  counts,
  isLeader,
  faces,
  back,
}: {
  appointments: AppointmentRow[];
  /** Echte Anzahl - die Listen selbst sind begrenzt. */
  counts: { open: number; overdue: number; done: number };
  isLeader: boolean;
  /** Profilbilder je Mitarbeiter-ID - nur fuer die Teamleitung. */
  faces: Record<number, string>;
  back: { href: string; label: string; mobileOnly?: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<View>("open");
  const [busy, setBusy] = useState<number | null>(null);
  const [detail, setDetail] = useState<AppointmentRow | null>(null);
  /* Was "heute" ist, entscheidet die Uhr des Geraets - nicht die des Servers. */
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    // Aus der Push-Erinnerung: /termine?termin=12 oeffnet genau diesen Termin.
    const id = Number(new URLSearchParams(window.location.search).get("termin"));
    const target = appointments.find((item) => item.id === id);
    if (target) {
      if (target.follow_up_done_at) setView("done");
      setDetail(target);
      // Nur einmal oeffnen - nach dem Abhaken laedt die Liste neu.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [appointments]);

  async function setDone(item: AppointmentRow, done: boolean) {
    setBusy(item.id);
    try {
      const response = await fetchWithTimeout(`/api/visits/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast(data.error ?? "Nicht gespeichert");
        return;
      }
      setDetail(null);
      if (done) {
        toast(`${item.contact_name || "Termin"} erledigt`, {
          action: { label: "Rückgängig", onClick: () => void setDone(item, false) },
        });
      } else {
        toast("Wieder offen");
      }
      router.refresh();
    } catch {
      toast("Keine Verbindung");
    } finally {
      setBusy(null);
    }
  }

  const open = appointments.filter((item) => !item.follow_up_done_at);
  const done = appointments.filter((item) => item.follow_up_done_at);
  const overdue = now ? open.filter((item) => slotOverdue(item.follow_up_at, now)) : [];

  // Offene Termine nach Tag - ueberfaellige zuerst, egal von wann.
  const groups: Array<{ key: string; title: string; late: boolean; items: AppointmentRow[] }> = [];
  if (now) {
    const today = toSlot(now).slice(0, 10);
    const tomorrow = toSlot(new Date(now.getTime() + 86_400_000)).slice(0, 10);
    if (overdue.length > 0) groups.push({ key: "late", title: "Überfällig", late: true, items: overdue });
    for (const item of open) {
      if (slotOverdue(item.follow_up_at, now)) continue;
      const day = slotDate(item.follow_up_at) || "ohne";
      let group = groups.find((g) => g.key === day);
      if (!group) {
        group = {
          key: day,
          title: day === today ? "Heute" : day === tomorrow ? "Morgen" : dayTitle(item.follow_up_at),
          late: false,
          items: [],
        };
        groups.push(group);
      }
      group.items.push(item);
    }
  }

  // Ueberfaellig zaehlt das Geraet, solange alle geladen sind; sonst gilt die Zahl vom Server.
  const overdueCount = counts.open > open.length ? counts.overdue : overdue.length;
  const summary = [`${counts.open} offen`, overdueCount > 0 && `${overdueCount} überfällig`].filter(Boolean).join(" · ");

  return (
    <div className="page-narrow">
      <PageHeader title={isLeader ? "Termine" : "Meine Termine"} subtitle={summary} back={back}>
        <Segmented<View>
          ariaLabel="Termine filtern"
          value={view}
          onChange={setView}
          options={[
            { value: "open", label: "Offen" },
            { value: "done", label: `Erledigt${counts.done ? ` · ${counts.done}` : ""}` },
          ]}
        />
      </PageHeader>

      {view === "open" ? (
        open.length === 0 ? (
          <EmptyState
            boxed
            icon={<IconCalendar className="h-6 w-6" />}
            title="Keine offenen Termine"
            text="Termine entstehen an der Tür."
          />
        ) : !now ? (
          <SkeletonList rows={4} />
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                <p className={`list-label ${group.late ? "text-danger" : ""}`}>
                  {group.title} · {group.items.length}
                </p>
                <ul className="list list-icons">
                  {group.items.map((item) => (
                    <li key={item.id} className="cell pr-2">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => setDetail(item)}
                      >
                        <TimeBlock slot={item.follow_up_at} late={group.late} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body">{item.contact_name || "Ohne Namen"}</span>
                          <span className="flex min-w-0 items-center gap-2 text-footnote text-muted">
                            {isLeader && <Avatar name={item.user_name} src={faces[item.user_id]} size={16} />}
                            <span className="truncate">{address(item)}</span>
                          </span>
                        </span>
                      </button>
                      {item.contact_phone && (
                        <a
                          href={`tel:${item.contact_phone.replace(/[^+\d]/g, "")}`}
                          className="icon-btn icon-btn-fill"
                          aria-label={`${item.contact_name || "Kontakt"} anrufen`}
                        >
                          <IconPhone className="h-5 w-5" />
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => void setDone(item, true)}
                        className="icon-btn icon-btn-accent"
                        aria-label={`${item.contact_name || "Termin"} als erledigt abhaken`}
                      >
                        <IconCheck className="h-5 w-5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : done.length === 0 ? (
        <EmptyState boxed icon={<IconCheck className="h-6 w-6" />} title="Noch nichts erledigt" />
      ) : (
        <ul className="list list-icons">
          {done.map((item) => (
            <li key={item.id} className="cell pr-2">
              <TimeBlock slot={item.follow_up_at} muted />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-muted line-through">{item.contact_name || "Ohne Namen"}</span>
                <span className="block truncate text-footnote text-muted">
                  {address(item)}
                  {isLeader && ` · ${item.user_name}`}
                </span>
              </span>
              <button
                type="button"
                className="icon-btn"
                disabled={busy === item.id}
                onClick={() => void setDone(item, false)}
                aria-label="Wieder öffnen"
              >
                <IconUndo className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <Sheet
          title={detail.contact_name || "Termin"}
          subtitle={`${slotLabel(detail.follow_up_at, now ?? undefined)} · ${address(detail)}`}
          onClose={() => setDetail(null)}
        >
          {detail.reason_note && <p className="mb-4 surface px-4 py-3 text-body">„{detail.reason_note}“</p>}
          <ul className="list list-icons">
            {detail.contact_phone && (
              <li>
                <Cell
                  href={`tel:${detail.contact_phone.replace(/[^+\d]/g, "")}`}
                  external
                  icon={<span className="glyph glyph-round"><IconPhone className="h-4 w-4" /></span>}
                  title="Anrufen"
                  subtitle={detail.contact_phone}
                />
              </li>
            )}
            {detail.lat !== null && detail.lng !== null && (
              <li>
                <Cell
                  href={routeUrl(detail.lat, detail.lng)}
                  external
                  icon={<span className="glyph glyph-round"><IconNavigate className="h-4 w-4" /></span>}
                  title="Route"
                />
              </li>
            )}
            {detail.street_id && (
              <li>
                <Cell
                  href={`/tour?street=${detail.street_id}&house=${encodeURIComponent(detail.house_number)}`}
                  icon={<span className="glyph glyph-round"><IconDoor className="h-4 w-4" /></span>}
                  title="An der Tür öffnen"
                />
              </li>
            )}
            {isLeader && <li><Cell title="Verantwortlich" detail={detail.user_name} /></li>}
          </ul>
          <button
            type="button"
            className={`btn btn-lg btn-block mt-4 ${detail.follow_up_done_at ? "btn-secondary" : "btn-primary"}`}
            disabled={busy === detail.id}
            onClick={() => void setDone(detail, !detail.follow_up_done_at)}
          >
            {detail.follow_up_done_at ? "Wieder öffnen" : "Erledigt"}
          </button>
        </Sheet>
      )}
    </div>
  );
}

/** Uhrzeit als Block links in der Zeile; ueberfaellig mit Tag. */
function TimeBlock({ slot, late = false, muted = false }: { slot: string; late?: boolean; muted?: boolean }) {
  const date = parseSlot(slot);
  const time = date ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` : "–";
  return (
    <span className={`glyph glyph-lg flex-col gap-0 leading-none ${late ? "bg-danger-tint text-danger" : ""}`}>
      {(late || muted) && date && (
        <span className="text-caption-2">{date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span>
      )}
      <span className={`text-caption font-bold ${muted ? "text-muted" : late ? "" : "text-ink"}`}>{time}</span>
    </span>
  );
}

function address(item: AppointmentRow): string {
  return [`${item.street_name ?? ""} ${item.house_number}`.trim(), item.doorbell_label].filter(Boolean).join(" · ");
}

/** "Dienstag, 29. September" */
function dayTitle(slot: string): string {
  const date = parseSlot(slot);
  if (!date) return "Ohne Datum";
  return date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}
