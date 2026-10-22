import type { ReactNode } from "react";
import Link from "next/link";
import {
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconDoor,
  IconExternal,
  IconPerson,
} from "./icons";
import { ReasonIcon } from "./ReasonIcon";

export { PageHeader } from "./PageHeader";

/*
 * Bausteine ohne Zustand - laufen in Server- und Client-Komponenten.
 * Gestaltet ueber die Klassen in globals.css; hier steht nur Aufbau.
 */

/* ------------------------------ Abschnitte ------------------------------ */

/** Kopf eines Abschnitts: Titel, auf Wunsch Anzahl, rechts Verweis oder Aktion. */
export function SectionHeader({
  title,
  count,
  href,
  linkLabel = "Alle",
  action,
  className = "",
}: {
  title: ReactNode;
  count?: number;
  href?: string;
  linkLabel?: string;
  action?: ReactNode;
  className?: string;
}) {
  // Titel und Verweis stehen auf einer Grundlinie; die 44-pt-Trefferflaeche
  // des Verweises waechst per Polster nach oben, ohne die Zeile hoeher zu machen.
  return (
    <div className={`mb-2 flex min-h-11 items-end px-1 ${className}`}>
      <div className="flex w-full items-baseline justify-between gap-4">
        <h2 className="section-title min-w-0 truncate">
          {title}
          {count !== undefined && (
            <span className="ml-2 font-normal text-muted">{count}</span>
          )}
        </h2>
        {href ? (
          <Link href={href} className="link -mb-2 -mt-4 shrink-0 pb-2 pt-4 text-subhead">
            {linkLabel}
            <IconChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          action && <div className="flex shrink-0 items-center gap-2">{action}</div>
        )}
      </div>
    </div>
  );
}

/** Kleine Gruppenueberschrift ueber einer Liste (iOS-Einstellungen). */
export function ListLabel({ children }: { children: ReactNode }) {
  return <p className="list-label">{children}</p>;
}

/* -------------------------------- Zeilen -------------------------------- */

interface CellProps {
  href?: string;
  /** Fuehrt aus der App hinaus (Tarifrechner, Route). */
  external?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Untertitel darf auf zwei Zeilen umbrechen, statt abgeschnitten zu werden. */
  wrap?: boolean;
  /** Wert rechts, leise (z. B. "3 offen"). */
  detail?: ReactNode;
  /** Eigenes Element rechts (Schalter, Knopf, Plakette). */
  trailing?: ReactNode;
  /** Pfeil nach rechts - Standard bei Verweisen. */
  chevron?: boolean;
  tone?: "danger" | "accent";
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  current?: boolean;
}

/**
 * Eine Zeile der gruppierten Liste. Hoehe ergibt sich aus dem Inhalt:
 * 48 pt mit einer Zeile, 60 pt mit Untertitel - ueberall gleich.
 */
export function Cell({
  href,
  external,
  onClick,
  icon,
  title,
  subtitle,
  wrap = false,
  detail,
  trailing,
  chevron,
  tone,
  disabled,
  className = "",
  ariaLabel,
  current,
}: CellProps) {
  const color = tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent-ink" : "";
  const inner = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-body ${color}`}>{title}</span>
        {subtitle && (
          <span className={`block text-footnote text-muted ${wrap ? "line-clamp-2" : "truncate"}`}>{subtitle}</span>
        )}
      </span>
      {detail !== undefined && detail !== null && detail !== false && (
        <span className="shrink-0 text-subhead text-muted">{detail}</span>
      )}
      {trailing}
      {external && !(href && /^(tel|mailto|sms):/.test(href)) ? (
        <IconExternal className="h-4 w-4 shrink-0 text-muted" />
      ) : (
        (chevron ?? Boolean(href)) && <IconChevronRight className="cell-chevron" />
      )}
    </>
  );
  const classes = `cell ${href || onClick ? "cell-tap" : ""} ${className}`;
  // Anrufen und Mail oeffnen die Telefon- bzw. Mail-App - kein neues Fenster.
  if (href && /^(tel|mailto|sms):/.test(href)) {
    return (
      <a href={href} className={classes} aria-label={ariaLabel}>
        {inner}
      </a>
    );
  }
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes} aria-label={ariaLabel}>
        {inner}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={classes} aria-label={ariaLabel} aria-current={current ? "page" : undefined}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={classes} aria-label={ariaLabel}>
        {inner}
      </button>
    );
  }
  return <div className={classes}>{inner}</div>;
}

/* ------------------------------- Kennzahlen ----------------------------- */

export interface StatItem {
  label: string;
  value: string | number;
  hint?: ReactNode;
  /** Abschluesse: die Zahl im Akzent. */
  accent?: boolean;
}

/**
 * Kennzahlen auf einer gemeinsamen Flaeche, durch Haarlinien getrennt -
 * grosse, ruhige Zahlen wie in Fitness, kleine leise Beschriftung.
 */
export function StatGrid({
  items,
  columns,
  size = "md",
}: {
  items: StatItem[];
  /** Spalten ab Tablet; auf dem Handy hoechstens zwei bzw. drei. */
  columns?: 2 | 3 | 4;
  size?: "md" | "lg";
}) {
  const cols = columns ?? (items.length >= 4 ? 4 : (items.length as 2 | 3));
  const grid =
    cols === 4
      ? "grid-cols-2 md:grid-cols-4"
      : cols === 3
        ? "grid-cols-3"
        : "grid-cols-2";
  return (
    <dl className={`grid gap-px overflow-hidden rounded-xl bg-separator ${grid}`}>
      {items.map((item) => (
        // justify-end: in umgekehrter Spalte heisst das "oben" - Beschriftungen stehen auf einer
        // Hoehe, auch wenn nur eine Nachbarzelle einen Zusatz traegt.
        <div key={item.label} className="flex min-w-0 flex-col-reverse justify-end bg-surface px-4 py-3">
          {item.hint && <dd className="order-first truncate text-footnote text-muted">{item.hint}</dd>}
          <dd
            className={`kpi truncate ${size === "lg" ? "text-large-title" : "text-title-1"} ${
              item.accent ? "text-accent-ink" : "text-ink"
            }`}
          >
            {item.value}
          </dd>
          <dt className="truncate text-footnote font-semibold text-ink-2">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** Schmaler Fortschrittsbalken im Akzent. */
export function ProgressBar({
  value,
  max,
  label,
  className = "",
}: {
  value: number;
  max: number;
  label?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={`h-1 w-full overflow-hidden rounded-full bg-fill-strong ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500 ease-spring"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Fortschritt als Ring - wie die Ringe in Fitness. Die Mitte traegt die
 * eigentliche Aussage (Prozent, Level, 3/8).
 */
export function ProgressRing({
  value,
  max,
  size = 44,
  stroke,
  label,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  label?: string;
  children?: ReactNode;
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const width = stroke ?? Math.max(3, Math.round(size / 9));
  const radius = (size - width) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={width} className="stroke-fill-strong" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={width}
          strokeLinecap="round"
          className="stroke-accent transition-[stroke-dashoffset] duration-500 ease-spring"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
        />
      </svg>
      {children !== undefined && (
        <span className="kpi absolute text-caption font-bold">{children}</span>
      )}
    </span>
  );
}

/* -------------------------------- Plaketten ----------------------------- */

export type Tone = "neutral" | "accent" | "danger" | "warn" | "ink";

/** Kleine Plakette. Farbe nur als Zusatz zum Wort. */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const cls =
    tone === "accent"
      ? "badge badge-accent"
      : tone === "danger"
        ? "badge badge-danger"
        : tone === "warn"
          ? "badge badge-warn"
          : tone === "ink"
            ? "badge badge-ink"
            : "badge";
  return <span className={cls}>{children}</span>;
}

const STATUS: Record<string, { label: string; tone: Tone; check?: boolean }> = {
  OPEN: { label: "Offen", tone: "neutral" },
  ACTIVE: { label: "In Arbeit", tone: "accent" },
  PAUSED: { label: "Pausiert", tone: "neutral" },
  DONE: { label: "Fertig", tone: "neutral", check: true },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS[status] ?? STATUS.OPEN;
  return (
    <Pill tone={style.tone}>
      {style.check && <IconCheck className="h-3 w-3" />}
      {style.label}
    </Pill>
  );
}

/* --------------------------------- Person ------------------------------- */

/** Profilbild oder Kuerzel ("Alex Krüger" wird "AK") im neutralen Kreis. */
export function Avatar({
  name,
  src,
  size = 32,
  loading = false,
  className = "",
}: {
  name: string | null;
  src?: string | null;
  size?: number;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <span
        className={`skeleton inline-block shrink-0 rounded-full ${className}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }
  if (src) {
    return (
      // Kleines, fertig zugeschnittenes Bild (eigene Adresse oder Data-URL) - nichts fuer next/image.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className={`shrink-0 rounded-full object-cover ring-1 ring-separator ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const short = name
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toLocaleUpperCase("de-DE") ?? "")
        .join("")
    : "";
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full bg-fill-strong font-semibold text-ink-2 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {/* Noch kein Name (etwa beim Anlegen): ein Personenzeichen statt eines Strichs. */}
      {short || <IconPerson className="h-1/2 w-1/2" />}
    </span>
  );
}

/* ------------------------------- Zustaende ------------------------------ */

/** Leerer Zustand: ein Zeichen, ein Satz, hoechstens eine Aktion. */
export function EmptyState({
  title,
  text,
  icon,
  action,
  boxed = false,
}: {
  title: string;
  text?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  /** Auf eigener Flaeche - wenn der Zustand allein auf der Seite steht. */
  boxed?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center px-6 text-center ${
        boxed ? "rounded-xl bg-surface py-12" : "py-8"
      }`}
    >
      {icon && <span className="glyph glyph-lg glyph-round mb-4 text-muted">{icon}</span>}
      <p className="text-headline">{title}</p>
      {text && <p className="mt-1 max-w-sm text-subhead text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Kurze Fehlermeldung unter einem Formular oder Knopf. */
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-danger-tint px-4 py-2 text-footnote font-semibold text-danger" role="alert">
      {children}
    </p>
  );
}

/** Ruhiger Hinweis, wenn er wirklich gebraucht wird (kein Erklaertext). */
export function Notice({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 text-subhead text-ink-2">
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/* ------------------------------ Ladezustaende --------------------------- */

export function SkeletonLine({
  width = "100%",
  height = 12,
  className = "",
}: {
  width?: string | number;
  height?: number;
  className?: string;
}) {
  return (
    <span
      className={`skeleton block rounded-full ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/** Platzhalter einer gruppierten Liste - Kreis und zwei Balken je Zeile. */
export function SkeletonList({ rows = 4, icon = true }: { rows?: number; icon?: boolean }) {
  return (
    <div className="list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="cell min-h-15">
          {icon && <span className="skeleton h-8 w-8 shrink-0 rounded-full" />}
          <span className="min-w-0 flex-1 space-y-2">
            <SkeletonLine width={`${72 - i * 8}%`} height={12} />
            <SkeletonLine width={`${44 - i * 4}%`} height={8} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Platzhalter einer Seite mit grossem Titel. */
export function SkeletonHeader() {
  return (
    <div className="space-y-2 pb-4 pt-12" aria-hidden="true">
      <SkeletonLine width="44%" height={32} className="rounded-lg" />
      <SkeletonLine width="28%" height={12} />
    </div>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div
      className={`grid gap-px overflow-hidden rounded-xl bg-separator ${count >= 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2 bg-surface px-4 py-4">
          <SkeletonLine width="50%" height={10} />
          <SkeletonLine width="40%" height={24} className="rounded-md" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- Ergebnisse ---------------------------- */

export const OUTCOME_LABEL: Record<string, string> = {
  SALE: "Abschluss",
  APPOINTMENT: "Termin",
  MET_NO_SALE: "Kein Abschluss",
  NOT_HOME: "Nicht angetroffen",
};

/**
 * Das Ergebnis eines Besuchs als Zeichen. Nur der Abschluss ist gefuellt
 * gruen mit Haekchen; alles andere bleibt neutral und traegt sein Zeichen
 * (bei Ablehnungen das Zeichen des Grundes, ohne dessen Kachelfarbe).
 */
export function OutcomeGlyph({
  outcome,
  reason,
  size = "md",
}: {
  outcome: string;
  /** Zeichen des Ablehnungsgrunds (src/lib/reason-icons.ts) */
  reason?: string | null;
  size?: "sm" | "md";
}) {
  const cls = `glyph glyph-round ${size === "sm" ? "glyph-sm" : ""} ${outcome === "SALE" ? "glyph-result" : ""}`;
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span className={cls} title={OUTCOME_LABEL[outcome]} aria-hidden="true">
      {outcome === "SALE" ? (
        <IconCheck className={icon} />
      ) : outcome === "APPOINTMENT" ? (
        <IconCalendar className={icon} />
      ) : outcome === "NOT_HOME" ? (
        <IconDoor className={icon} />
      ) : (
        <ReasonIcon name={reason} className={icon} />
      )}
    </span>
  );
}

/** Kippschalter wie in den iOS-Einstellungen. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

/** Wahl aus wenigen Moeglichkeiten - die Leiste aus den iOS-Einstellungen. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  glass = false,
  className = "",
}: {
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  glass?: boolean;
  className?: string;
}) {
  return (
    <div className={`seg ${glass ? "seg-glass" : ""} ${className}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Dieselbe Leiste als Navigation zwischen Seiten. */
export function SegmentedLinks({
  options,
  current,
  ariaLabel,
  glass = false,
  className = "",
}: {
  options: Array<{ href: string; label: string; key: string }>;
  current: string;
  ariaLabel: string;
  glass?: boolean;
  className?: string;
}) {
  return (
    <nav className={`seg ${glass ? "seg-glass" : ""} ${className}`} aria-label={ariaLabel}>
      {options.map((option) => (
        <Link
          key={option.key}
          href={option.href}
          scroll={false}
          aria-current={option.key === current ? "page" : undefined}
        >
          <span>{option.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/* --------------------------------- Format ------------------------------- */

/** "1 Straße" statt "1 Straßen". */
export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("de-DE")} ${count === 1 ? one : many}`;
}

export function percent(part: number, total: number): string {
  if (!total) return "–";
  return `${Math.round((part / total) * 100)} %`;
}

export function euro(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return value.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

export function ct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ct`;
}
