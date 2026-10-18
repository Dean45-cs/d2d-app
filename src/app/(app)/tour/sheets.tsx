"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { ReasonTile } from "@/components/ReasonIcon";
import {
  IconBan,
  IconUndo,
  IconBuilding,
  IconCheck,
  IconCloudUp,
  IconHome,
  IconNavigate,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from "@/components/icons";
import {
  Cell,
  InlineError,
  ListLabel,
  OutcomeGlyph,
  ProgressRing,
  Segmented,
  StatGrid,
} from "@/components/ui";
import type { StreetWithStats, Totals, VisitRow } from "@/lib/queries";
import type { BuildingType, RejectionReason } from "@/lib/types";
import type { QueuedWrite } from "@/lib/offline-queue";
import type { LevelProgress } from "@/lib/levels";
import { normalizeSlot, quickSlots, slotDate, slotLabel, slotTime, toSlot } from "@/lib/appointments";
import { parseDoorbellLines, type DoorbellInput } from "@/lib/doorbells";
import { MAX_NOT_HOME_ATTEMPTS } from "@/lib/doors";
import { routeUrl } from "@/lib/map";
import { PRODUCTS, formatTime, type Bell, type EnergyType, type TerritoryLite } from "./model";

/* ------------------------------------------------------------------------ */
/*                            Strasse und Gebiet                             */
/* ------------------------------------------------------------------------ */

export function StreetSheet({
  territories,
  territoryId,
  streets,
  streetId,
  progress,
  onTerritory,
  onPick,
  onClose,
}: {
  territories: TerritoryLite[];
  territoryId: number | null;
  streets: StreetWithStats[];
  streetId: number | null;
  progress: Map<number, { open: number; total: number }>;
  onTerritory: (id: number) => void;
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase("de-DE");
  const shown = needle ? streets.filter((s) => s.name.toLocaleLowerCase("de-DE").includes(needle)) : streets;

  return (
    <Sheet title="Wo bist du?" onClose={onClose}>
      {territories.length > 1 && (
        <div className="chips -mx-4 mb-4 px-4" role="group" aria-label="Gebiet">
          {territories.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip"
              aria-pressed={t.id === territoryId}
              onClick={() => onTerritory(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {streets.length > 6 && (
        <label className="relative mb-4 block">
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            className="field pl-12"
            placeholder="Straße suchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Straße suchen"
            enterKeyHint="search"
          />
        </label>
      )}

      {streets.length === 0 ? (
        <p className="py-8 text-center text-subhead text-muted">In diesem Gebiet sind noch keine Straßen.</p>
      ) : (
        <ul className="list">
          {shown.map((s) => {
            const p = progress.get(s.id);
            return (
              <li key={s.id}>
                <Cell
                  onClick={() => onPick(s.id)}
                  title={s.name}
                  subtitle={[
                    p && p.total > 0
                      ? p.open === 0
                        ? `Alle ${p.total} erledigt`
                        : `${p.open} von ${p.total} offen`
                      : s.house_numbers || "Ohne Hausnummern",
                    s.sale_count > 0 ? `${s.sale_count} ${s.sale_count === 1 ? "Abschluss" : "Abschlüsse"}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  trailing={
                    s.id === streetId ? (
                      <IconCheck className="h-5 w-5 text-accent-ink" />
                    ) : p && p.total > 0 ? (
                      <ProgressRing value={p.total - p.open} max={p.total} size={28} stroke={4} />
                    ) : undefined
                  }
                />
              </li>
            );
          })}
          {shown.length === 0 && <li className="cell justify-center text-subhead text-muted">Keine Straße gefunden</li>}
        </ul>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/*                             Ablehnungsgrund                               */
/* ------------------------------------------------------------------------ */

export function ReasonSheet({
  place,
  reasons,
  busy,
  onPick,
  onClose,
}: {
  place: string;
  reasons: RejectionReason[];
  busy: boolean;
  onPick: (reason: RejectionReason, note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(reason: RejectionReason) {
    if (reason.code === "SONSTIGES" && !note.trim()) {
      setNoteOpen(true);
      setError("Kurz notieren, woran es lag");
      return;
    }
    onPick(reason, note.trim());
  }

  return (
    <Sheet title="Gespräch ohne Abschluss" subtitle={place} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {reasons.map((reason) => (
          <button
            key={reason.id}
            type="button"
            disabled={busy}
            onClick={() => pick(reason)}
            className="flex min-h-14 items-center gap-3 rounded-xl bg-surface px-3 text-left text-subhead font-semibold transition-transform active:scale-[0.97] disabled:opacity-40"
          >
            <ReasonTile name={reason.icon} />
            <span className="min-w-0 flex-1 leading-tight">{reason.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {noteOpen ? (
          <>
            <label className="label" htmlFor="reason-note">
              Notiz
            </label>
            <input
              id="reason-note"
              className="field"
              placeholder="z. B. nächste Woche nochmal"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setError(null);
              }}
              autoFocus
            />
            {error && <div className="mt-2"><InlineError>{error}</InlineError></div>}
          </>
        ) : (
          <button type="button" className="btn btn-plain btn-sm" onClick={() => setNoteOpen(true)}>
            <IconPlus className="h-4 w-4" />
            Notiz
          </button>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/*                                  Termin                                   */
/* ------------------------------------------------------------------------ */

export function AppointmentSheet({
  place,
  contact,
  now,
  busy,
  onSubmit,
  onClose,
}: {
  place: string;
  /** Name vom Klingelschild - den muss niemand abtippen. */
  contact: string;
  now: Date | null;
  busy: boolean;
  onSubmit: (values: { slot: string; name: string; phone: string; note: string }) => void;
  onClose: () => void;
}) {
  const slots = useMemo(() => quickSlots(now ?? undefined), [now]);
  const [slot, setSlot] = useState(slots[0]?.value ?? "");
  const [name, setName] = useState(contact);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  return (
    <Sheet
      title="Termin"
      subtitle={place}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || !slot}
          className="btn btn-primary btn-lg btn-block"
          onClick={() => onSubmit({ slot, name: name.trim(), phone: phone.trim(), note: note.trim() })}
        >
          {slot ? `Speichern · ${slotLabel(slot, now ?? undefined)}` : "Zeit wählen"}
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {slots.map((option) => (
          <button
            key={option.value}
            type="button"
            className="chip min-h-12 justify-center"
            aria-pressed={slot === option.value}
            onClick={() => setSlot(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
        <div>
          <label className="label" htmlFor="slot-date">
            Tag
          </label>
          <input
            id="slot-date"
            type="date"
            className="field"
            value={slotDate(slot)}
            onChange={(e) => setSlot(normalizeSlot(`${e.target.value} ${slotTime(slot) || "18:00"}`))}
          />
        </div>
        <div>
          <label className="label" htmlFor="slot-time">
            Uhrzeit
          </label>
          <input
            id="slot-time"
            type="time"
            className="field"
            value={slotTime(slot)}
            onChange={(e) =>
              setSlot(normalizeSlot(`${slotDate(slot) || toSlot(now ?? new Date()).slice(0, 10)} ${e.target.value}`))
            }
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
        <div>
          <label className="label" htmlFor="contact-name">
            Name
          </label>
          <input
            id="contact-name"
            className="field"
            autoComplete="off"
            placeholder="Frau Müller"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 120))}
          />
        </div>
        <div>
          <label className="label" htmlFor="contact-phone">
            Telefon
          </label>
          <input
            id="contact-phone"
            className="field"
            inputMode="tel"
            autoComplete="off"
            placeholder="optional"
            value={phone}
            onChange={(e) => setPhone(e.target.value.slice(0, 40))}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="appointment-note">
          Notiz
        </label>
        <input
          id="appointment-note"
          className="field"
          placeholder="optional"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/*                                 Abschluss                                 */
/* ------------------------------------------------------------------------ */

/**
 * Abschluss: Produkt waehlen oeffnet den Tarifrechner. Der Vorgang bleibt
 * vorgemerkt, bis er nach der Erfassung bestaetigt wird.
 */
export function SaleSheet({
  place,
  product,
  busy,
  onPick,
  onClose,
}: {
  place: string;
  product: EnergyType;
  busy: boolean;
  onPick: (product: EnergyType) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Auftrag starten" subtitle={place} onClose={onClose}>
      <div className="grid gap-2">
        {PRODUCTS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={busy}
            onClick={() => onPick(option.value)}
            className={`btn btn-lg btn-block justify-between ${option.value === product ? "btn-primary" : "btn-secondary"}`}
          >
            {option.label}
            <span className="text-subhead font-normal opacity-80">Tarifrechner</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/*                                   Haus                                    */
/* ------------------------------------------------------------------------ */

export function HouseSheet({
  title,
  type,
  units,
  bells,
  lastLine,
  attempts,
  blocked,
  blockedBy,
  canUnblock,
  route,
  busy,
  onType,
  onAddBells,
  onAddCount,
  onRename,
  onRemoveBell,
  onBlockBell,
  onUnblockBell,
  onBlock,
  onUnblock,
  onClose,
}: {
  title: string;
  type: BuildingType;
  units: number;
  /** `used`: an der Klingel haengen schon Eintraege - dann laesst sie sich nicht mehr entfernen. */
  bells: Array<{ bell: Bell; used: boolean; blocked: boolean }>;
  lastLine: string | null;
  attempts: number;
  blocked: boolean;
  blockedBy: string | null;
  canUnblock: boolean;
  route: string | null;
  busy: boolean;
  onType: (type: "EFH" | "MFH") => void;
  onAddBells: (entries: DoorbellInput[]) => void;
  onAddCount: (count: number) => void;
  onRename: (bell: Bell, label: string, floor: string) => void;
  onRemoveBell: (bell: Bell) => void;
  onBlockBell: (bell: Bell) => void;
  onUnblockBell: (bell: Bell) => void;
  onBlock: () => void;
  onUnblock: () => void;
  onClose: () => void;
}) {
  const [names, setNames] = useState("");
  const [count, setCount] = useState("");
  const [editing, setEditing] = useState<{ bell: Bell; label: string; floor: string } | null>(null);
  const [adding, setAdding] = useState(bells.length === 0 && type === "MFH");
  const [error, setError] = useState<string | null>(null);

  function submitNames() {
    const entries = parseDoorbellLines(names);
    if (entries.length === 0) {
      setError("Mindestens einen Namen eintragen");
      return;
    }
    setNames("");
    setAdding(false);
    setError(null);
    onAddBells(entries);
  }

  function submitCount() {
    const wanted = Number(count);
    if (!Number.isFinite(wanted) || wanted < 1) {
      setError("Anzahl eintragen");
      return;
    }
    setCount("");
    setAdding(false);
    setError(null);
    onAddCount(wanted);
  }

  return (
    <Sheet title={title} onClose={onClose}>
      {/* Unbekannter Typ: nichts vorgewaehlt - ein Mehrfamilienhaus waere
          sonst nach dem ersten Eintrag fuers ganze Team erledigt. */}
      <Segmented<"EFH" | "MFH" | "">
        ariaLabel="Haustyp"
        value={type === "MFH" || type === "EFH" ? type : ""}
        onChange={(value) => {
          if (!value) return;
          onType(value);
          if (value === "MFH" && bells.length === 0) setAdding(true);
        }}
        options={[
          { value: "EFH", label: "Einfamilienhaus", icon: <IconHome className="h-4 w-4" /> },
          { value: "MFH", label: "Mehrfamilienhaus", icon: <IconBuilding className="h-4 w-4" /> },
        ]}
      />

      <ul className="list mt-4">
        {units > 1 && <li><Cell title="Wohneinheiten" detail={units} /></li>}
        <li><Cell title="Zuletzt" detail={lastLine ?? "Noch niemand"} /></li>
        {type !== "MFH" && attempts > 0 && (
          <li><Cell title="Versuche" detail={`${attempts} von ${MAX_NOT_HOME_ATTEMPTS}`} /></li>
        )}
        {route && (
          <li>
            <Cell href={route} external icon={<IconNavigate className="h-5 w-5 text-ink-2" />} title="Route" />
          </li>
        )}
      </ul>

      {type === "MFH" && (
        <div className="mt-6">
          <ListLabel>Klingelschilder</ListLabel>
          {bells.length > 0 && (
            <ul className="list">
              {bells.map(({ bell, used, blocked: bellBlocked }) =>
                editing && editing.bell === bell ? (
                  <li key={`edit-${bell.label}`} className="space-y-2 p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                      <input
                        className="field"
                        value={editing.label}
                        onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                        aria-label="Name auf dem Schild"
                        autoFocus
                      />
                      <input
                        className="field"
                        value={editing.floor}
                        onChange={(e) => setEditing({ ...editing, floor: e.target.value })}
                        placeholder="Etage"
                        aria-label="Etage"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>
                        Abbrechen
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busy || !editing.label.trim()}
                        onClick={() => {
                          onRename(bell, editing.label, editing.floor);
                          setEditing(null);
                        }}
                      >
                        Sichern
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={bell.id ?? `neu-${bell.label}`} className="cell pr-2">
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-body ${bellBlocked ? "text-danger" : ""}`}>
                        {bell.label}
                        {bell.floor && <span className="text-ink-2"> · {bell.floor}</span>}
                      </span>
                      {bellBlocked && <span className="block text-footnote text-muted">Gesperrt</span>}
                    </span>
                    {bell.id !== null && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`${bell.label} umbenennen`}
                        onClick={() => setEditing({ bell, label: bell.label, floor: bell.floor })}
                      >
                        <IconPencil className="h-5 w-5" />
                      </button>
                    )}
                    {bellBlocked ? (
                      canUnblock && (
                        <button type="button" className="btn btn-plain btn-sm" onClick={() => onUnblockBell(bell)}>
                          Freigeben
                        </button>
                      )
                    ) : (
                      <>
                        {/* Sperren auch nach einem Gespraech - ein Nein gilt. */}
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`${bell.label} sperren`}
                          onClick={() => onBlockBell(bell)}
                        >
                          <IconBan className="h-5 w-5" />
                        </button>
                        {!used && (
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`${bell.label} entfernen`}
                            onClick={() => onRemoveBell(bell)}
                          >
                            <IconTrash className="h-5 w-5" />
                          </button>
                        )}
                      </>
                    )}
                  </li>
                ),
              )}
            </ul>
          )}

          {adding ? (
            <div className="mt-4 space-y-4">
              <div>
                <label className="label" htmlFor="bell-names">
                  Namen vom Klingelbrett · einer je Zeile
                </label>
                <textarea
                  id="bell-names"
                  className="field"
                  rows={4}
                  placeholder={"Müller, 2. OG\nSchmidt\nKaya, EG"}
                  value={names}
                  onChange={(e) => setNames(e.target.value)}
                />
                <button type="button" className="btn btn-primary btn-block mt-2" disabled={busy} onClick={submitNames}>
                  Schilder anlegen
                </button>
              </div>
              <div className="flex items-end gap-2">
                <div className="w-24 shrink-0">
                  <label className="label" htmlFor="bell-count">
                    Anzahl
                  </label>
                  <input
                    id="bell-count"
                    className="field"
                    inputMode="numeric"
                    placeholder={units > 1 ? String(units) : "6"}
                    value={count}
                    onChange={(e) => setCount(e.target.value.slice(0, 3))}
                  />
                </div>
                <button type="button" className="btn btn-secondary flex-1" disabled={busy} onClick={submitCount}>
                  Ohne Namen anlegen
                </button>
              </div>
              {error && <InlineError>{error}</InlineError>}
            </div>
          ) : (
            <button type="button" className="btn btn-plain btn-sm mt-2" onClick={() => setAdding(true)}>
              <IconPlus className="h-4 w-4" />
              Schilder anlegen
            </button>
          )}
        </div>
      )}

      <ul className="list mt-6">
        <li>
          {blocked ? (
            canUnblock ? (
              <Cell onClick={onUnblock} title="Sperre aufheben" tone="accent" />
            ) : (
              <Cell title="Gesperrt" detail={blockedBy ?? undefined} />
            )
          ) : (
            <Cell
              onClick={onBlock}
              icon={<IconBan className="h-5 w-5 text-danger" />}
              title="Adresse sperren"
              tone="danger"
              chevron={false}
            />
          )}
        </li>
      </ul>
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/*                                  Sperren                                  */
/* ------------------------------------------------------------------------ */

export function BlockSheet({
  target,
  busy,
  onConfirm,
  onClose,
}: {
  target: string;
  busy: boolean;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Sheet
      title={`${target} sperren?`}
      subtitle="Gilt fürs ganze Team. Aufheben kann nur die Teamleitung."
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy}
          className="btn btn-danger btn-lg btn-block"
          onClick={() => onConfirm(note.trim())}
        >
          <IconBan className="h-5 w-5" />
          Dauerhaft sperren
        </button>
      }
    >
      <label className="label" htmlFor="block-note">
        Grund
      </label>
      <input
        id="block-note"
        className="field"
        placeholder="z. B. Schild „Keine Werbung“"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 200))}
      />
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/*                        Heute: Zahlen, Warteschlange                       */
/* ------------------------------------------------------------------------ */

export function DaySheet({
  totals,
  level,
  pending,
  online,
  recent,
  last,
  onSend,
  onDiscard,
  onClose,
}: {
  totals: Totals;
  level: LevelProgress;
  pending: QueuedWrite[];
  online: boolean;
  recent: VisitRow[];
  /** Zuletzt gespeicherter Eintrag - zuruecknehmen, solange nichts Neues kam. */
  last: { text: string; onUndo: () => void } | null;
  onSend: () => void;
  onDiscard: (localId: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Heute" onClose={onClose}>
      <StatGrid
        columns={3}
        items={[
          { label: "Türen", value: totals.doors ?? 0 },
          {
            label: "Gespräche",
            value: totals.met ?? 0,
            hint: (totals.doors ?? 0) > 0 ? `${Math.round(((totals.met ?? 0) / (totals.doors ?? 1)) * 100)} % da` : undefined,
          },
          { label: "Abschlüsse", value: totals.sales ?? 0, accent: (totals.sales ?? 0) > 0 },
        ]}
      />

      <ul className="list mt-4">
        <li>
          <Cell
            href="/team/erfolge"
            icon={
              <ProgressRing value={level.xpInLevel} max={level.xpForNextLevel} size={36} stroke={4}>
                {level.level}
              </ProgressRing>
            }
            title={`Level ${level.level} · ${level.title}`}
            subtitle={`Noch ${level.xpToNextLevel.toLocaleString("de-DE")} XP bis Level ${level.level + 1}`}
          />
        </li>
      </ul>

      {last && (
        <ul className="list list-icons mt-4">
          <li>
            <Cell
              onClick={last.onUndo}
              icon={
                <span className="glyph">
                  <IconUndo className="h-4 w-4" />
                </span>
              }
              title="Letzten Eintrag zurücknehmen"
              subtitle={last.text}
              chevron={false}
            />
          </li>
        </ul>
      )}

      {(pending.length > 0 || !online) && (
        <div className="mt-6">
          <ListLabel>{online ? "Wartet auf Senden" : "Offline gespeichert"}</ListLabel>
          <ul className="list">
            {pending.map((item) => (
              <li key={item.localId} className="cell pr-2">
                <span className="glyph glyph-round">
                  <IconCloudUp className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-subhead">{item.label}</span>
                  {item.error && <span className="block text-footnote text-danger">{item.error}</span>}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${item.label} verwerfen`}
                  onClick={() => onDiscard(item.localId)}
                >
                  <IconX className="h-4 w-4" />
                </button>
              </li>
            ))}
            {pending.length === 0 && <li className="cell text-subhead text-muted">Nichts offen</li>}
          </ul>
          {pending.length > 0 && online && (
            <button type="button" className="btn btn-primary btn-block mt-4" onClick={onSend}>
              Jetzt senden
            </button>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-6">
          <ListLabel>Zuletzt erfasst</ListLabel>
          <ul className="list list-icons">
            {recent.map((v) => (
              <li key={v.id} className="cell">
                <OutcomeGlyph outcome={v.outcome} reason={v.reason_icon} />
                <span className="min-w-0 flex-1 truncate text-subhead">
                  {v.street_name ?? "–"} {v.house_number}
                  {v.reason_label && <span className="text-muted"> · {v.reason_label}</span>}
                </span>
                <span className="shrink-0 text-footnote text-muted">{formatTime(v.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href="/start" className="btn btn-plain btn-block mt-4">
        Alle Zahlen
      </Link>
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/*                            Nummer eingeben                                */
/* ------------------------------------------------------------------------ */

export function NumberSheet({
  suggestions,
  onOpen,
  onClose,
}: {
  suggestions: string[];
  onOpen: (number: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <Sheet
      title="Hausnummer"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          disabled={!value.trim()}
          onClick={() => onOpen(value.trim())}
        >
          Öffnen
        </button>
      }
    >
      <input
        className="field kpi h-20 text-center text-large-title"
        inputMode="text"
        autoComplete="off"
        placeholder="12a"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 12))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onOpen(value.trim());
        }}
        enterKeyHint="go"
        aria-label="Hausnummer"
        autoFocus
      />
      {suggestions.length > 0 && (
        <div className="mt-4 flex justify-center gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip min-w-16 justify-center" onClick={() => onOpen(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
