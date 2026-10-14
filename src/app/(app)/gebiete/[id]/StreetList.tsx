"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HouseNumberWithStats, StreetWithStats } from "@/lib/queries";
import { IconBan, IconCheck, IconDoor, IconNavigate, IconTrash } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { Cell, EmptyState, ListLabel, ProgressRing, Segmented, plural } from "@/components/ui";
import { routeUrl } from "@/lib/map";
import { doorStatus, MAX_NOT_HOME_ATTEMPTS, whenLabel } from "@/lib/doors";

type StreetStatus = "OPEN" | "ACTIVE" | "DONE";

/**
 * Strassen des Gebiets als Liste: Ring fuer den Fortschritt, Zahlen in
 * einer Zeile. Ein Tipp oeffnet die Strasse mit Status, Hausnummern und
 * dem Weg dorthin.
 */
export function StreetList({
  territoryId,
  streets,
  numbers,
  isLeader,
  canStatus,
}: {
  territoryId: number;
  streets: StreetWithStats[];
  /** Hausnummern je Strassen-ID, aus der Kartenauswahl uebernommen. */
  numbers: Record<number, HouseNumberWithStats[]>;
  isLeader: boolean;
  canStatus: boolean;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = streets.find((s) => s.id === openId) ?? null;

  return (
    <section aria-labelledby={`streets-${territoryId}`}>
      <p id={`streets-${territoryId}`} className="list-label">
        {plural(streets.length, "Straße", "Straßen")}
      </p>
      {streets.length === 0 ? (
        <div className="surface">
          <EmptyState title="Noch keine Straßen" />
        </div>
      ) : (
        <ul className="list list-icons">
          {streets.map((s) => {
            const progress = streetProgress(s, numbers[s.id] ?? []);
            return (
              <li key={s.id}>
                <Cell
                  onClick={() => setOpenId(s.id)}
                  icon={
                    s.status === "DONE" ? (
                      <span className="glyph glyph-round">
                        <IconCheck className="h-4 w-4" />
                      </span>
                    ) : (
                      <ProgressRing value={progress.done} max={Math.max(progress.total, 1)} size={32} stroke={4} />
                    )
                  }
                  title={s.name}
                  subtitle={[
                    s.house_numbers ? `Nr. ${s.house_numbers}` : null,
                    progress.label,
                    s.sale_count > 0 ? plural(s.sale_count, "Abschluss", "Abschlüsse") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  chevron
                />
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <StreetSheet
          street={open}
          houses={numbers[open.id] ?? []}
          isLeader={isLeader}
          canStatus={canStatus}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}

function StreetSheet({
  street,
  houses,
  isLeader,
  canStatus,
  onClose,
}: {
  street: StreetWithStats;
  houses: HouseNumberWithStats[];
  isLeader: boolean;
  canStatus: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [status, setStatus] = useState<StreetStatus>(street.status as StreetStatus);

  async function changeStatus(next: StreetStatus) {
    const previous = status;
    setStatus(next);
    const response = await fetch(`/api/streets/${street.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    if (!response?.ok) {
      setStatus(previous);
      toast("Status nicht gespeichert");
      return;
    }
    router.refresh();
  }

  async function remove() {
    const ok = await confirm({
      title: `${street.name} entfernen?`,
      text: "Erfasste Türen bleiben in der Auswertung.",
      confirmLabel: "Entfernen",
      danger: true,
    });
    if (!ok) return;
    const response = await fetch(`/api/streets/${street.id}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) {
      toast("Straße nicht entfernt");
      return;
    }
    toast(`${street.name} entfernt`);
    onClose();
    router.refresh();
  }

  const doneHouses = streetProgress(street, houses).done;

  return (
    <Sheet
      title={street.name}
      subtitle={[street.house_numbers ? `Nr. ${street.house_numbers}` : null, streetProgress(street, houses).label]
        .filter(Boolean)
        .join(" · ")}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {street.lat !== null && street.lng !== null && (
            <a
              href={routeUrl(street.lat, street.lng, "walk")}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-lg"
              aria-label={`Route zur ${street.name}`}
            >
              <IconNavigate className="h-5 w-5" />
              Route
            </a>
          )}
          <Link href={`/tour?street=${street.id}`} className="btn btn-primary btn-lg flex-1">
            <IconDoor className="h-5 w-5" />
            Klingeln
          </Link>
        </div>
      }
    >
      {canStatus && (
        <Segmented
          ariaLabel={`Status von ${street.name}`}
          value={status}
          onChange={changeStatus}
          options={[
            { value: "OPEN", label: "Offen" },
            { value: "ACTIVE", label: "In Arbeit" },
            { value: "DONE", label: "Fertig" },
          ]}
        />
      )}

      {houses.length > 0 && (
        <>
          <ListLabel>{`${doneHouses} von ${houses.length} Häusern erfasst`}</ListLabel>
          <ul className="flex flex-wrap gap-2" aria-label="Hausnummern">
            {houses.map((house) => (
              <li key={house.id}>
                <HouseChip house={house} />
              </li>
            ))}
          </ul>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-footnote text-muted" aria-label="Legende">
            <LegendItem state="open" label="Offen" />
            <LegendItem state="retry" label="Nochmal" />
            <LegendItem state="done" label="Erfasst" />
            <LegendItem state="sale" label="Abschluss" />
            <LegendItem state="blocked" label="Gesperrt" />
          </ul>
        </>
      )}

      {isLeader && (
        <ul className="list mt-6">
          <li>
            <Cell
              onClick={() => void remove()}
              icon={<IconTrash className="h-5 w-5 text-danger" />}
              title="Aus dem Gebiet entfernen"
              tone="danger"
            />
          </li>
        </ul>
      )}
      {dialog}
    </Sheet>
  );
}

/** Erfasst ist ein Haus, sobald jemand dort war oder es gesperrt ist - wie beim Gebiet. */
function houseTouched(house: HouseNumberWithStats): boolean {
  return house.visit_count > 0 || Boolean(house.blocked_at);
}

function streetProgress(
  street: StreetWithStats,
  houses: HouseNumberWithStats[],
): { done: number; total: number; label: string } {
  if (houses.length > 0) {
    const done = houses.filter(houseTouched).length;
    return { done, total: houses.length, label: `${done} von ${houses.length} Häusern` };
  }
  if (street.units > 0) {
    const done = Math.min(street.visit_count, street.units);
    return { done, total: street.units, label: `${done} von ${street.units} Türen` };
  }
  return { done: 0, total: 0, label: plural(street.visit_count, "Tür", "Türen") };
}

type ChipState = "open" | "retry" | "done" | "sale" | "blocked";

/* Form vor Farbe: offen hohl, nochmal grau, erfasst dunkel, Abschluss gruen. */
const CHIP_CLASS: Record<ChipState, string> = {
  open: "bg-surface text-ink ring-1 ring-inset ring-[var(--ink-2)]",
  retry: "bg-fill-strong text-ink",
  done: "bg-fill text-ink-2",
  sale: "bg-accent text-on-accent",
  blocked: "bg-danger-tint text-danger",
};

function LegendItem({ state, label }: { state: ChipState; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-3 w-4 rounded-xs ${CHIP_CLASS[state]}`} aria-hidden="true" />
      {label}
    </li>
  );
}

/**
 * Eine Hausnummer als Plakette. Ein Mehrfamilienhaus ist erst durch, wenn
 * jede Klingel dran war - sonst saehe die Strasse nach dem ersten Eintrag
 * schon fertig aus.
 */
function HouseChip({ house }: { house: HouseNumberWithStats }) {
  const mfh = house.building_type === "MFH";
  const status = doorStatus(house);
  const blocked = status === "BLOCKED";
  const retry = !mfh && status === "RETRY";
  const done = mfh ? house.bell_count > 0 && house.bell_done_count >= house.bell_count : status === "DONE";
  const state: ChipState = blocked ? "blocked" : house.sale_count > 0 ? "sale" : retry ? "retry" : done ? "done" : "open";

  const description = [
    `Nr. ${house.number}`,
    blocked
      ? `gesperrt${house.blocked_by_name ? ` von ${house.blocked_by_name}` : ""}${house.blocked_note ? ` – ${house.blocked_note}` : ""}`
      : null,
    mfh && house.bell_count > 0 ? `${house.bell_done_count} von ${house.bell_count} Klingeln` : null,
    retry ? `${house.not_home_count} von ${MAX_NOT_HOME_ATTEMPTS} Versuchen` : null,
    house.last_visit_user ? `zuletzt ${house.last_visit_user}, ${whenLabel(house.last_visit_at)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/tour?street=${house.street_id}&house=${encodeURIComponent(house.number)}`}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-sm px-2 text-subhead font-semibold tabular-nums ${CHIP_CLASS[state]}`}
      title={description}
      aria-label={description}
    >
      {house.number}
      {blocked ? (
        <IconBan className="h-3.5 w-3.5" />
      ) : state === "sale" ? (
        <IconCheck className="h-3.5 w-3.5" />
      ) : mfh && house.bell_count > 0 && !done ? (
        <span className="text-caption font-medium opacity-70">
          {house.bell_done_count}/{house.bell_count}
        </span>
      ) : retry ? (
        <span className="text-caption font-medium opacity-70">
          {house.not_home_count}/{MAX_NOT_HOME_ATTEMPTS}
        </span>
      ) : null}
    </Link>
  );
}
