"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppointmentRow } from "@/lib/queries";
import {
  Avatar,
  EmptyState,
  Note,
  PageHeader,
  Segmented,
  SkeletonRows,
  plural,
} from "@/components/ui";
import { IconCalendar, IconCheck, IconNavigate, IconPhone, IconUndo } from "@/components/icons";
import { routeUrl } from "@/lib/map";
import { parseSlot, slotDate, slotOverdue, toSlot } from "@/lib/appointments";

type View = "open" | "done";

/**
 * Vereinbarte Termine - der Rückweg des Tages.
 *
 * Ein Termin ist die zweitbeste Sache nach dem Abschluss, verfällt aber, wenn
 * ihn niemand mehr sieht. Deshalb stehen überfällige oben und lassen sich von
 * hier aus direkt anrufen.
 */
export function AppointmentList({
  appointments,
  isLeader,
  faces,
}: {
  appointments: AppointmentRow[];
  isLeader: boolean;
  /** Profilbilder je Mitarbeiter-ID - nur fuer die Teamleitung. */
  faces: Record<number, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("open");
  /* Was "heute" ist, entscheidet die Uhr des Geräts - nicht die des Servers. */
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  async function setDone(id: number, done: boolean) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/visits/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? "Konnte nicht gespeichert werden.");
        return;
      }
      router.refresh();
    } catch {
      setError("Keine Verbindung – bitte gleich noch einmal versuchen.");
    } finally {
      setBusy(null);
    }
  }

  const open = appointments.filter((item) => !item.follow_up_done_at);
  const done = appointments.filter((item) => item.follow_up_done_at);
  const overdue = now ? open.filter((item) => slotOverdue(item.follow_up_at, now)) : [];

  const summary = [
    plural(open.length, "offener Termin", "offene Termine"),
    overdue.length > 0 && `${overdue.length} überfällig`,
  ]
    .filter(Boolean)
    .join(" · ");

  /* Offene Termine nach Tag - überfällige zuerst, egal von wann. */
  const groups: Array<{ key: string; title: string; late: boolean; items: AppointmentRow[] }> = [];
  if (now) {
    const today = toSlot(now).slice(0, 10);
    const tomorrow = toSlot(new Date(now.getTime() + 86_400_000)).slice(0, 10);
    if (overdue.length > 0) {
      groups.push({ key: "late", title: "Überfällig", late: true, items: overdue });
    }
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

  return (
    <div>
      <PageHeader
        title={isLeader ? "Termine" : "Meine Termine"}
        subtitle={summary}
        action={
          <Segmented<View>
            ariaLabel="Termine filtern"
            value={view}
            onChange={setView}
            options={[
              { value: "open", label: "Offen" },
              { value: "done", label: `Erledigt${done.length ? ` · ${done.length}` : ""}` },
            ]}
          />
        }
      />

      {error && (
        <div className="mb-4" role="alert">
          <Note tone="danger">{error}</Note>
        </div>
      )}

      {view === "open" ? (
        open.length === 0 ? (
          <EmptyState
            icon={<IconCalendar className="h-7 w-7" />}
            title="Keine offenen Termine"
            text="Termine entstehen an der Tür über „Termin vereinbart“ und erscheinen dann hier."
          />
        ) : !now ? (
          <SkeletonRows rows={5} />
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                <h2
                  className="mb-2 ml-1 flex items-center gap-2 text-[13px] font-semibold"
                  style={{ color: group.late ? "var(--danger-ink)" : "var(--ink-2)" }}
                >
                  {group.title}
                  <span className="muted font-medium tabular-nums">{group.items.length}</span>
                </h2>
                <ul className="list">
                  {group.items.map((item) => (
                    <AppointmentItem
                      key={item.id}
                      item={item}
                      late={group.late}
                      isLeader={isLeader}
                      face={faces[item.user_id]}
                      busy={busy === item.id}
                      onDone={() => void setDone(item.id, true)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : done.length === 0 ? (
        <EmptyState
          icon={<IconCheck className="h-7 w-7" />}
          title="Noch nichts erledigt"
          text="Abgehakte Termine landen hier und lassen sich jederzeit wieder öffnen."
        />
      ) : (
        <ul className="list">
          {done.map((item) => (
            <li key={item.id} className="list-row">
              <SlotBlock slot={item.follow_up_at} showDay muted />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium line-through decoration-[var(--line-strong)]">
                  {item.contact_name || "Ohne Namen"}
                </span>
                <span className="muted block truncate text-[12.5px]">
                  {address(item)}
                  {isLeader && ` · ${item.user_name}`}
                </span>
              </span>
              <button
                type="button"
                className="icon-btn icon-btn-outline shrink-0"
                disabled={busy === item.id}
                onClick={() => void setDone(item.id, false)}
                aria-label="Wieder öffnen"
                title="Wieder öffnen"
              >
                <IconUndo className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AppointmentItem({
  item,
  late,
  isLeader,
  face,
  busy,
  onDone,
}: {
  item: AppointmentRow;
  late: boolean;
  isLeader: boolean;
  face: string | undefined;
  busy: boolean;
  onDone: () => void;
}) {
  const phone = item.contact_phone.replace(/[^+\d]/g, "");
  return (
    <li className="list-row items-start py-3 sm:items-center">
      <SlotBlock slot={item.follow_up_at} showDay={late} late={late} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold">{item.contact_name || "Ohne Namen"}</p>
        <p className="muted truncate text-[12.5px]">{address(item)}</p>
        {(isLeader || item.reason_note) && (
          <p className="muted mt-1 flex min-w-0 items-center gap-1.5 text-[12px]">
            {isLeader && (
              <>
                <Avatar name={item.user_name} src={face} size={18} />
                <span className="shrink-0">{item.user_name}</span>
              </>
            )}
            {isLeader && item.reason_note && <span aria-hidden>·</span>}
            {item.reason_note && <span className="truncate">„{item.reason_note}“</span>}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-center">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="icon-btn icon-btn-outline"
            aria-label={`${item.contact_name || "Kontakt"} anrufen`}
            title={item.contact_phone}
          >
            <IconPhone className="h-4 w-4" />
          </a>
        )}
        {item.lat !== null && item.lng !== null && (
          <a
            href={routeUrl(item.lat, item.lng)}
            target="_blank"
            rel="noreferrer"
            className="icon-btn icon-btn-outline"
            aria-label="Route öffnen"
            title="Route"
          >
            <IconNavigate className="h-4 w-4" />
          </a>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onDone}
          className="icon-btn"
          style={{
            background: "color-mix(in srgb, var(--energy-500) 14%, transparent)",
            color: "var(--ok-ink)",
          }}
          aria-label="Als erledigt abhaken"
          title="Erledigt"
        >
          <IconCheck className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

/** Uhrzeit als Block links in der Zeile, auf Wunsch mit Tag darüber. */
function SlotBlock({
  slot,
  showDay = false,
  late = false,
  muted = false,
}: {
  slot: string;
  showDay?: boolean;
  late?: boolean;
  muted?: boolean;
}) {
  const date = parseSlot(slot);
  const time = date
    ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
    : "–";
  const day = date
    ? `${date.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "")} ${date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`
    : "";
  return (
    <span
      className="grid w-[3.75rem] shrink-0 place-items-center rounded-[var(--r-sm)] py-1.5 leading-tight"
      style={{
        background: late
          ? "color-mix(in srgb, var(--signal-500) 11%, transparent)"
          : "var(--card-inset)",
        color: late ? "var(--danger-ink)" : muted ? "var(--ink-muted)" : "var(--ink)",
      }}
    >
      {showDay && <span className="text-[10.5px] font-semibold opacity-80">{day}</span>}
      <span className="text-[14px] font-bold tabular-nums">{time}</span>
    </span>
  );
}

function address(item: AppointmentRow): string {
  return [
    `${item.street_name ?? ""} ${item.house_number}`.trim(),
    item.doorbell_label,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Dienstag, 29. September" */
function dayTitle(slot: string): string {
  const date = parseSlot(slot);
  if (!date) return "Ohne Datum";
  return date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}
