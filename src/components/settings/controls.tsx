"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconCheck, IconMinus, IconPlus } from "@/components/icons";
import { Cell, Switch, ToneTile, type SymbolTone } from "@/components/ui";
import { usePrefs } from "@/components/PrefsSync";
import { GOAL_LIMITS, setPrefs, type Preferences } from "@/lib/preferences";

/*
 * Bausteine der Einstellungen - Zeilen fuer ul.list, wie in den
 * iOS-Einstellungen: Schalter, Auswahl mit Haken, Regler fuer Zahlen.
 * Jede Zeile liest und schreibt eine Einstellung (src/lib/preferences.ts);
 * die Wirkung ist sofort zu sehen, darum ohne Toast.
 */

type BooleanKey = { [K in keyof Preferences]: Preferences[K] extends boolean ? K : never }[keyof Preferences];

/** Zeichen auf der Kachel im Symbolton - wie in der Profil-Uebersicht. */
export function SettingIcon({ tone, children }: { tone: SymbolTone; children: ReactNode }) {
  return (
    <ToneTile tone={tone}>
      <span className="grid h-4 w-4 place-items-center [&>svg]:h-4 [&>svg]:w-4">{children}</span>
    </ToneTile>
  );
}

/** Eine Einstellung zum Ein- und Ausschalten. */
export function PrefSwitch({
  name,
  title,
  subtitle,
  icon,
  disabled,
}: {
  name: BooleanKey;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  const prefs = usePrefs();
  return (
    <li>
      <Cell
        icon={icon}
        title={title}
        subtitle={subtitle}
        wrap
        trailing={
          <Switch
            checked={prefs[name]}
            onChange={(on) => setPrefs({ [name]: on } as Partial<Preferences>)}
            label={title}
            disabled={disabled}
          />
        }
      />
    </li>
  );
}

/** Schalter fuer etwas, das nicht in den Einstellungen liegt (Push-Arten, Merker der Seiten). */
export function SwitchRow({
  title,
  subtitle,
  icon,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <li>
      <Cell
        icon={icon}
        title={title}
        subtitle={subtitle}
        wrap
        trailing={<Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />}
      />
    </li>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  subtitle?: string;
  /** Kleines Bild links - etwa "Aa" in der Groesse der Wahl. */
  leading?: ReactNode;
}

/** Wahl aus wenigen - je Moeglichkeit eine Zeile, die gewaehlte mit Haken. */
export function ChoiceRows<T extends string>({
  choices,
  value,
  onChange,
  name,
}: {
  choices: Array<Choice<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Fuer Bildschirmleser: worum es geht. */
  name: string;
}) {
  return (
    <>
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          // Die Liste ist die Auswahlgruppe (role="radiogroup" am ul) - die Zeile nur Huelle.
          <li key={choice.value} role="none">
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${name}: ${choice.label}`}
              className="cell cell-tap"
              onClick={() => onChange(choice.value)}
            >
              {choice.leading}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body">{choice.label}</span>
                {choice.subtitle && <span className="block text-footnote text-muted line-clamp-2">{choice.subtitle}</span>}
              </span>
              <IconCheck className={`h-5 w-5 shrink-0 text-accent-ink ${selected ? "" : "invisible"}`} />
            </button>
          </li>
        );
      })}
    </>
  );
}

/** Dieselbe Wahl, an eine Einstellung gebunden. */
export function PrefChoice<K extends keyof Preferences>({
  name,
  label,
  choices,
}: {
  name: K;
  label: string;
  choices: Array<Choice<Extract<Preferences[K], string>>>;
}) {
  const prefs = usePrefs();
  return (
    <ChoiceRows
      name={label}
      choices={choices}
      value={prefs[name] as Extract<Preferences[K], string>}
      onChange={(value) => setPrefs({ [name]: value } as Partial<Preferences>)}
    />
  );
}

/** Ein Tagesziel: Minus, Zahl, Plus - Schritte und Grenzen aus GOAL_LIMITS. */
export function GoalStepper({
  name,
  title,
  unit,
  icon,
}: {
  name: keyof typeof GOAL_LIMITS;
  title: string;
  /** "Türen" - fuer Bildschirmleser und den Untertitel. */
  unit: [one: string, many: string];
  icon?: ReactNode;
}) {
  const prefs = usePrefs();
  const { min, max, step } = GOAL_LIMITS[name];
  const value = prefs[name];
  const change = (delta: number) => setPrefs({ [name]: Math.min(max, Math.max(min, value + delta)) } as Partial<Preferences>);
  return (
    <li>
      <div className="cell">
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body">{title}</span>
          <span className="block text-footnote text-muted">je Tag</span>
        </span>
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label={title}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => change(-step)}
            disabled={value <= min}
            aria-label={`${title}: weniger`}
          >
            <IconMinus className="h-4 w-4" />
          </button>
          <output className="kpi min-w-12 text-center text-title-3" aria-live="polite" aria-label={`${value} ${value === 1 ? unit[0] : unit[1]}`}>
            {value}
          </output>
          <button
            type="button"
            className="icon-btn"
            onClick={() => change(step)}
            disabled={value >= max}
            aria-label={`${title}: mehr`}
          >
            <IconPlus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Ein Merker im localStorage, den eine Seite selbst fuehrt (zuletzt gewaehlte
 * Kartenansicht, Sortierung der Strassen ...). Die Einstellungen zeigen und
 * setzen ihn - die Seite liest ihn wie bisher.
 */
export function useStoredChoice<T extends string>(key: string, fallback: T, valid: readonly T[]): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored && (valid as readonly string[]).includes(stored)) setValue(stored as T);
    } catch {
      // Ohne Speicher bleibt der Standard.
    }
    // valid ist eine feste Liste je Aufruf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const change = (next: T) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // Privater Modus: dann gilt die Wahl bis zum Neuladen.
    }
  };
  return [value, change];
}
