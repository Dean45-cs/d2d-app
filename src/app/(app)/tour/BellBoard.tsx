"use client";

import { IconBan, IconBell, IconCheck, IconPencil } from "@/components/icons";
import { Avatar, OutcomeGlyph } from "@/components/ui";
import { MAX_NOT_HOME_ATTEMPTS, doorStatus, whenLabel, type DoorFacts } from "@/lib/doors";
import type { TeamFace } from "@/lib/types";
import { bellKey } from "@/lib/doorbells";
import type { Bell } from "./model";

export interface BellRow {
  bell: Bell;
  facts: DoorFacts;
  done: boolean;
}

/**
 * Das Klingelbrett eines Mehrfamilienhauses. Eine Zeile je Schild: Nummer
 * am Brett, wer zuletzt da war, wie es ausging. Antippen waehlt die Klingel
 * - die Ergebnisknoepfe unten meinen ab dann sie.
 */
export function BellBoard({
  rows,
  selected,
  next,
  faceOf,
  onPick,
  onEdit,
}: {
  rows: BellRow[];
  selected: string;
  /** Hier geht es weiter (nur bei durchnummerierten Schildern). */
  next: string | null;
  faceOf: (userId: number | null) => TeamFace | null;
  onPick: (label: string) => void;
  onEdit: () => void;
}) {
  const doneCount = rows.filter((row) => row.done).length;
  return (
    <section aria-label="Klingelbrett">
      <div className="mb-2 flex min-h-11 items-center justify-between px-1">
        <p className="text-footnote font-semibold text-ink-2">
          Klingeln · {doneCount} von {rows.length} erledigt
        </p>
        <button type="button" className="btn btn-plain btn-sm" onClick={onEdit}>
          <IconPencil className="h-4 w-4" />
          Bearbeiten
        </button>
      </div>
      <ul className="list list-icons">
        {rows.map(({ bell, facts, done }, index) => {
          const chosen = bellKey(bell.label) === bellKey(selected);
          const blocked = Boolean(facts.blocked_at);
          const retry = doorStatus(facts) === "RETRY";
          const face = faceOf(bell.last_visit_user_id);
          const isNext = !chosen && next !== null && bellKey(bell.label) === bellKey(next);
          const sub = blocked
            ? `Gesperrt${bell.blocked_by_name ? ` von ${bell.blocked_by_name}` : ""}`
            : bell.last_visit_at
              ? [
                  bell.last_visit_user ?? "Jemand",
                  whenLabel(bell.last_visit_at),
                  retry ? `${facts.not_home_count}/${MAX_NOT_HOME_ATTEMPTS}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Noch niemand hier";
          return (
            <li key={bell.id ?? `neu-${bellKey(bell.label)}`}>
              <button
                type="button"
                onClick={() => onPick(bell.label)}
                className={`cell cell-tap min-h-15 ${chosen ? "bg-accent-tint" : ""}`}
                aria-pressed={chosen}
                aria-label={`Klingel ${index + 1}, ${bell.label}${bell.floor ? `, ${bell.floor}` : ""}, ${sub}${
                  done ? ", erledigt" : isNext ? ", hier geht es weiter" : ""
                }`}
              >
                <span className="relative shrink-0" aria-hidden="true">
                  {blocked ? (
                    <span className="glyph glyph-round text-danger">
                      <IconBan className="h-4 w-4" />
                    </span>
                  ) : bell.last_outcome ? (
                    <OutcomeGlyph outcome={bell.last_outcome} reason={bell.last_reason_icon} />
                  ) : face ? (
                    <Avatar name={face.name} src={face.avatar} size={32} />
                  ) : (
                    <span className="glyph glyph-round">
                      <IconBell className="h-4 w-4" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-body ${done && !chosen ? "text-muted line-through" : ""}`}>
                    <span className="mr-2 text-muted">{index + 1}</span>
                    {bell.label}
                    {bell.floor && <span className="text-ink-2"> · {bell.floor}</span>}
                  </span>
                  <span className="block truncate text-footnote text-muted">{sub}</span>
                </span>
                {isNext && <span className="badge badge-accent">Weiter</span>}
                {chosen && <IconCheck className="h-5 w-5 text-accent-ink" />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
