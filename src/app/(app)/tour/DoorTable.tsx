"use client";

import type { ReactNode } from "react";
import { IconChevronRight, IconCrosshair, IconSearch, IconX } from "@/components/icons";

export interface DoorRow {
  key: string;
  /** Linke Spalte: Hausnummer ("12 A") bzw. Platz am Klingelbrett ("3"). */
  lead: string;
  title: string;
  meta?: string;
  /** Hier gab es einen Abschluss (irgendwann) - gruener Balken links. */
  sale?: boolean;
  blocked?: boolean;
  /** Ergebnis-Zeichen rechts. */
  glyph?: ReactNode;
  /** Oeffnet etwas (Mehrfamilienhaus) statt die Tuer zu waehlen. */
  drill?: boolean;
  selected?: boolean;
  ariaLabel: string;
  onClick: () => void;
}

/**
 * Tueren als Tabelle - eine Zeile je Hausnummer bzw. Klingel, wie in den
 * Vertriebs-Apps der Netzbetreiber: links fett die Nummer, daneben der Stand
 * in Worten, rechts das Zeichen. Abwechselnd getoente Zeilen halten die Zeile
 * auch in der Sonne, ein gruener Balken links heisst: hier gab es einen
 * Abschluss - gesperrt ist damit nichts.
 *
 * Antippen waehlt die Tuer (die Ergebnisleiste meint dann sie) oder oeffnet
 * das Mehrfamilienhaus. Nichts springt von selbst weiter.
 */
export function DoorTable({
  columns,
  count,
  rows,
  footer,
  empty,
  label,
}: {
  /** Ueberschriften der beiden linken Spalten, etwa ["Nr.", "Stand"]. */
  columns: [string, string];
  /** Rechts im Kopf, etwa "12 von 24 offen". */
  count?: string;
  rows: DoorRow[];
  /** Letzte Zeile: "Nr. 12a öffnen", "Klingelschilder anlegen". */
  footer?: ReactNode;
  /** Steht da, wenn keine Zeile passt. */
  empty?: ReactNode;
  label: string;
}) {
  return (
    <section className="door-table" aria-label={label}>
      <div className="door-table-head" aria-hidden="true">
        <span className="door-lead-col">{columns[0]}</span>
        <span className="min-w-0 flex-1">{columns[1]}</span>
        {count && <span className="shrink-0 normal-case tracking-normal">{count}</span>}
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.key} data-door={row.key}>
            <button
              type="button"
              className="door-row"
              data-sale={row.sale || undefined}
              aria-pressed={row.drill ? undefined : Boolean(row.selected)}
              aria-label={row.ariaLabel}
              onClick={row.onClick}
            >
              <span className="door-lead">{row.lead}</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-body ${row.blocked ? "text-danger" : ""}`}>{row.title}</span>
                {row.meta && <span className="block truncate text-footnote text-muted">{row.meta}</span>}
              </span>
              {row.glyph}
              {row.drill && <IconChevronRight className="cell-chevron" />}
            </button>
          </li>
        ))}
        {rows.length === 0 && empty && <li className="cell justify-center text-subhead text-muted">{empty}</li>}
        {footer && <li>{footer}</li>}
      </ul>
    </section>
  );
}

/** Die Zeile am Ende der Tabelle: etwas anlegen oder oeffnen. */
export function DoorTableAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className="door-row text-accent-ink" onClick={onClick}>
      <span className="door-lead" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-body">{label}</span>
    </button>
  );
}

/**
 * Ueber der Tabelle: filtern statt blaettern ("Hausnummer filtern"), dazu
 * "Nur offene" und - in der Strasse - die naechste offene Tuer ab hier.
 */
export function DoorFilter({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  onlyOpen,
  onToggleOpen,
  nearby,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Enter: die eine passende Tuer oeffnen - oder die getippte Nummer. */
  onSubmit: () => void;
  placeholder: string;
  /** Fuer Bildschirmleser ausgeschrieben: "Hausnummer filtern". */
  label: string;
  onlyOpen: boolean;
  onToggleOpen: () => void;
  nearby?: { busy: boolean; onClick: () => void };
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="relative block min-w-0 flex-1">
        <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          className={`field pl-12 ${value ? "pr-11" : ""}`}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value.slice(0, 20))}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit();
          }}
          enterKeyHint="go"
          autoComplete="off"
          aria-label={label}
        />
        {value && (
          <button
            type="button"
            className="icon-btn absolute right-0 top-1/2 -translate-y-1/2"
            onClick={() => onChange("")}
            aria-label="Filter leeren"
          >
            <IconX className="h-4 w-4" />
          </button>
        )}
      </label>
      {nearby && (
        <button
          type="button"
          className="icon-btn icon-btn-fill shrink-0"
          onClick={nearby.onClick}
          disabled={nearby.busy}
          aria-busy={nearby.busy}
          aria-label="Nächste offene Tür in meiner Nähe"
          title="In meiner Nähe"
        >
          <IconCrosshair className={`h-5 w-5 ${nearby.busy ? "animate-pulse" : ""}`} />
        </button>
      )}
      <button type="button" className="chip min-h-11 shrink-0" aria-pressed={onlyOpen} onClick={onToggleOpen}>
        Nur offene
      </button>
    </div>
  );
}
