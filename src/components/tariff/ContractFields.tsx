"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { IconX } from "@/components/icons";
import {
  convertBase,
  coversKwh,
  kwhLabel,
  type BaseUnit,
  type CompareTariffOption,
  type PriceCheck,
  type PriceField,
} from "@/lib/tariff-compare";
import type { ContractDraft } from "@/lib/tariff-memory";

/** Tarifname, wenn er mehr sagt als der Anbieter ("OStrom" von OStrom: nichts). */
export function tariffName(contract: Pick<ContractDraft, "provider" | "name">): string {
  const name = contract.name.trim();
  return name.toLocaleLowerCase("de-DE") === contract.provider.trim().toLocaleLowerCase("de-DE") ? "" : name;
}

/** "E wie Einfach · Strom Basic" - wie die Zeile im Feld steht. */
export function contractLabel(contract: Pick<ContractDraft, "provider" | "name">): string {
  return [contract.provider.trim(), tariffName(contract)].filter(Boolean).join(" · ");
}

function searchable(text: string): string {
  return text.toLocaleLowerCase("de-DE").replace(/[_\s·]+/g, " ").trim();
}

/** Tarife der Liste, die zum Getippten passen - die fuer den Verbrauch passenden zuerst. */
function matches(options: CompareTariffOption[], text: string, kwh: number | null): CompareTariffOption[] {
  const tokens = searchable(text).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  return options
    .filter((option) => {
      const haystack = searchable(`${option.provider} ${option.name}`);
      return tokens.every((token) => haystack.includes(token));
    })
    .sort((a, b) => Number(coversKwh(b, kwh)) - Number(coversKwh(a, kwh)) || a.provider.localeCompare(b.provider, "de"))
    .slice(0, 6);
}

/**
 * Eine Zeile des Vergleichs: wer liefert, Arbeitspreis, Grundpreis (pro Monat
 * oder Jahr, wie auf dem Blatt) und Bonus. Bei neuen Tarifen schlaegt das
 * Namensfeld die Tarife aus der Provisionsliste vor - ein Tipp statt Abtippen.
 */
export function ContractFields({
  contract,
  check,
  kwh,
  options,
  placeholder,
  label,
  leading,
  footer,
  onChange,
  onPick,
  onRemove,
}: {
  contract: ContractDraft;
  check: PriceCheck;
  kwh: number | null;
  /** Tarife zum Auswaehlen - leer beim aktuellen Vertrag */
  options: CompareTariffOption[];
  placeholder: string;
  /** Beschriftung fuer Vorlese-Programme: "Aktueller Vertrag", "Neuer Tarif 2" */
  label: string;
  /** Steht vor dem Namensfeld (PLZ auf der Seite "Tarifvergleich") */
  leading?: ReactNode;
  /** Unter den Feldern: Vorschau oder Vorschlag */
  footer?: ReactNode;
  onChange: (patch: Partial<ContractDraft>) => void;
  onPick?: (option: CompareTariffOption) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const text = contractLabel(contract);
  const found = useMemo(
    () => (focused && contract.tariffId === null ? matches(options, text, kwh) : []),
    [focused, contract.tariffId, options, text, kwh],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = found.length > 0;
  // Feld nach oben holen, sobald Vorschlaege kommen - im Blatt laegen sie sonst unter dem Hauptknopf.
  useEffect(() => {
    if (shown) inputRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [shown]);
  const error = !check.ok ? check : null;
  const invalid = (field: PriceField) => error?.field === field;

  function switchUnit() {
    const next: BaseUnit = contract.unit === "month" ? "year" : "month";
    onChange({ unit: next, base: convertBase(contract.base, contract.unit, next) });
  }

  return (
    <div className="surface p-3" role="group" aria-label={label}>
      <div className="flex items-start gap-2">
        {leading}
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            className="field scroll-mt-16"
            value={text}
            placeholder={placeholder}
            aria-label={`${label}: Anbieter und Tarif`}
            aria-autocomplete={options.length > 0 ? "list" : undefined}
            aria-controls={found.length > 0 ? `${id}-list` : undefined}
            aria-expanded={options.length > 0 ? found.length > 0 : undefined}
            role={options.length > 0 ? "combobox" : undefined}
            autoComplete="off"
            enterKeyHint="next"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            // Getippt statt gewaehlt: der Name gehoert dann zu keinem Tarif der Liste.
            onChange={(event) => onChange({ provider: event.target.value, name: "", tariffId: null })}
          />
          {found.length > 0 && (
            <ul id={`${id}-list`} role="listbox" className="menu inset-x-0 top-full mt-1 max-h-72 min-w-0 overflow-y-auto">
              {found.map((option) => {
                const fits = coversKwh(option, kwh);
                return (
                  <li key={option.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      className="menu-item py-2"
                      // Vor dem Blur waehlen - sonst ist die Liste weg, bevor der Tipp ankommt.
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onPick?.(option);
                        setFocused(false);
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body">{option.name}</span>
                        <span className="block truncate text-footnote text-muted">
                          {option.provider}
                          {!fits && kwh !== null ? ` · nicht für ${kwhLabel(kwh)}` : ""}
                        </span>
                      </span>
                      {option.business && <span className="badge">Gewerbe</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {onRemove && (
          <button type="button" className="icon-btn -mr-1 shrink-0" onClick={onRemove} aria-label={`${label} entfernen`}>
            <IconX className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <NumberField
          label="ct/kWh"
          ariaLabel={`${label}: Arbeitspreis in ct/kWh`}
          value={contract.ct}
          invalid={invalid("ct")}
          onChange={(ct) => onChange({ ct })}
        />
        <NumberField
          label={
            <button
              type="button"
              className="-my-1 inline-flex min-h-6 items-center gap-1 rounded-full text-accent-ink"
              onClick={switchUnit}
              aria-label={`Grundpreis pro ${contract.unit === "month" ? "Monat" : "Jahr"} – auf ${contract.unit === "month" ? "Jahr" : "Monat"} umschalten`}
            >
              €/{contract.unit === "month" ? "Monat" : "Jahr"}
              <SwapGlyph />
            </button>
          }
          ariaLabel={`${label}: Grundpreis in Euro pro ${contract.unit === "month" ? "Monat" : "Jahr"}`}
          value={contract.base}
          invalid={invalid("base")}
          placeholder="0"
          onChange={(base) => onChange({ base })}
        />
        <NumberField
          label="Bonus €"
          ariaLabel={`${label}: einmaliger Bonus in Euro`}
          value={contract.bonus}
          invalid={invalid("bonus")}
          placeholder="0"
          onChange={(bonus) => onChange({ bonus })}
        />
      </div>
      {error?.error ? (
        <p className="mt-2 px-1 text-footnote font-semibold text-danger" role="alert">
          {error.error}
        </p>
      ) : (
        footer
      )}
    </div>
  );
}

/** Zwei Pfeile: die Einheit wechselt beim Tippen. */
function SwapGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5h8.5L10 4M12 9.5H3.5L6 12" />
    </svg>
  );
}

function NumberField({
  label,
  ariaLabel,
  value,
  invalid,
  placeholder,
  onChange,
}: {
  label: ReactNode;
  /** Vollstaendige Beschriftung fuer Vorlese-Programme - sichtbar steht nur die Einheit. */
  ariaLabel: string;
  value: string;
  invalid: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <span className="label truncate">{label}</span>
      <input
        className="field px-3 tabular-nums"
        inputMode="decimal"
        enterKeyHint="next"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        style={invalid ? { boxShadow: "inset 0 0 0 2px var(--danger)" } : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
