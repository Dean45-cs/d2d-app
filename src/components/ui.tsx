import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  IconCalendar,
  IconChat,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDoor,
} from "./icons";

/**
 * Kopf einer Seite: grosser Titel, darunter eine Zeile mit dem, was gerade
 * gilt (Datum, Anzahl, Zeitraum) - keine Erklaerung, was die Seite kann.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Ruecksprung ueber dem Titel, etwa "Alle Gebiete". */
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link href={back.href} className="link -ml-1 mb-2 px-1 py-0.5">
          <IconChevronLeft className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.025em] md:text-[30px]">
            {title}
          </h1>
          {subtitle && (
            <p className="muted mt-1 text-[14px] leading-snug">{subtitle}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
    </header>
  );
}

/**
 * Kopf eines Abschnitts: Titel, auf Wunsch mit Anzahl, rechts ein Verweis
 * oder eine eigene Aktion.
 */
export function SectionHeader({
  title,
  count,
  href,
  linkLabel = "Alle anzeigen",
  action,
  className = "mb-3",
}: {
  title: ReactNode;
  count?: number;
  href?: string;
  linkLabel?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`section-head ${className}`}>
      <h2 className="section-title min-w-0 truncate">
        {title}
        {count !== undefined && (
          <span className="muted ml-1.5 font-medium tabular-nums">{count}</span>
        )}
      </h2>
      {href ? (
        <Link href={href} className="link shrink-0">
          {linkLabel}
          <IconChevronRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        action
      )}
    </div>
  );
}

const TONE_INK: Record<string, string> = {
  neutral: "var(--ink)",
  brand: "var(--tint)",
  success: "var(--ok-ink)",
  warn: "var(--warn-ink)",
  danger: "var(--danger-ink)",
};

const TONE_DOT: Record<string, string> = {
  neutral: "var(--ink-muted)",
  brand: "var(--brand-500)",
  success: "var(--energy-500)",
  warn: "var(--gas-500)",
  danger: "var(--signal-500)",
};

export type Tone = keyof typeof TONE_INK;

/**
 * Eine Kennzahl. Die Zahl bleibt dunkel - Farbe traegt nur, was gut oder
 * schlecht ist (Abschluss, ueberfaellig). Der Punkt vor der Beschriftung
 * verbindet die Kachel mit derselben Farbe in Diagrammen und Listen.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
}) {
  const colored = tone === "success" || tone === "danger";
  return (
    <div className="card min-w-0 px-4 py-3.5">
      <p className="muted flex items-center gap-1.5 truncate text-[12.5px] font-medium">
        {tone !== "neutral" && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: TONE_DOT[tone] }}
            aria-hidden
          />
        )}
        {label}
      </p>
      <p
        className="mt-1.5 truncate text-[26px] font-bold leading-none tabular-nums md:text-[28px]"
        style={{ color: colored ? TONE_INK[tone] : "var(--ink)", letterSpacing: "-0.025em" }}
      >
        {value}
      </p>
      {hint && <p className="muted mt-1.5 truncate text-[12px]">{hint}</p>}
    </div>
  );
}

/**
 * Mehrere Zahlen in einer Karte, durch Haarlinien getrennt - ruhiger als
 * einzelne Kacheln, wenn die Werte zusammen gelesen werden.
 */
export function StatGroup({
  items,
}: {
  items: Array<{ label: string; value: string | number; hint?: string; tone?: Tone }>;
}) {
  return (
    <div
      className="card grid divide-x overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        borderColor: "var(--line)",
      }}
    >
      {items.map((item) => (
        <div key={item.label} className="px-3 py-3 text-center" style={{ borderColor: "var(--line)" }}>
          <p
            className="text-[27px] font-bold leading-none tabular-nums"
            style={{ color: TONE_INK[item.tone ?? "neutral"], letterSpacing: "-0.02em" }}
          >
            {item.value}
          </p>
          <p className="muted mt-1 text-[11px] font-semibold leading-tight">{item.label}</p>
          {item.hint && <p className="muted text-[10px] leading-tight">{item.hint}</p>}
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  tone = "brand",
  size = "md",
}: {
  value: number;
  max: number;
  tone?: "brand" | "success" | "warn";
  size?: "sm" | "md";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill =
    tone === "success"
      ? "var(--energy-500)"
      : tone === "warn"
        ? "var(--gas-500)"
        : "var(--brand-500)";
  return (
    <div
      className={`${size === "sm" ? "h-1.5" : "h-2"} w-full overflow-hidden rounded-full`}
      style={{ background: "color-mix(in srgb, var(--ink) 10%, transparent)" }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${pct}%`,
          background: fill,
          transitionTimingFunction: "var(--ease-spring)",
        }}
      />
    </div>
  );
}

/**
 * Fortschritt als Ring - er steht neben einer Zahl, wo ein Balken die Zeile
 * sprengen wuerde. Die Zahl in der Mitte bleibt die eigentliche Aussage.
 */
export function ProgressRing({
  value,
  max,
  size = 44,
  tone = "brand",
  children,
}: {
  value: number;
  max: number;
  size?: number;
  tone?: "brand" | "success";
  children?: ReactNode;
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const stroke = size >= 40 ? 4 : 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = tone === "success" ? "var(--energy-500)" : "var(--brand-500)";
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke="color-mix(in srgb, var(--ink) 12%, transparent)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          style={{ transition: "stroke-dashoffset .5s var(--ease-spring)" }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums">{children}</span>
    </span>
  );
}

const STATUS_STYLES: Record<string, { label: string; bg: string; fg: string }> = {
  OPEN: { label: "Offen", bg: "color-mix(in srgb, var(--ink) 9%, transparent)", fg: "var(--ink-muted)" },
  ACTIVE: { label: "In Arbeit", bg: "color-mix(in srgb, var(--brand-500) 15%, transparent)", fg: "var(--tint)" },
  DONE: { label: "Fertig", bg: "color-mix(in srgb, var(--energy-500) 18%, transparent)", fg: "var(--ok-ink)" },
  PAUSED: { label: "Pausiert", bg: "color-mix(in srgb, var(--gas-500) 20%, transparent)", fg: "var(--warn-ink)" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.OPEN;
  return (
    <span className="badge" style={{ background: style.bg, color: style.fg }}>
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: style.fg }}
        aria-hidden
      />
      {style.label}
    </span>
  );
}

/** Farbige Plakette mit Ton aus der Markenpalette. */
export function Pill({
  tone = "neutral",
  children,
  style,
}: {
  tone?: Tone;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const base: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: "color-mix(in srgb, var(--ink) 8%, transparent)", fg: "var(--ink-muted)" },
    brand: { bg: "color-mix(in srgb, var(--brand-500) 14%, transparent)", fg: "var(--tint)" },
    success: { bg: "color-mix(in srgb, var(--energy-500) 17%, transparent)", fg: "var(--ok-ink)" },
    warn: { bg: "color-mix(in srgb, var(--gas-500) 20%, transparent)", fg: "var(--warn-ink)" },
    danger: { bg: "color-mix(in srgb, var(--signal-500) 15%, transparent)", fg: "var(--danger-ink)" },
  };
  const t = base[tone];
  return (
    <span className="badge" style={{ background: t.bg, color: t.fg, ...style }}>
      {children}
    </span>
  );
}

/**
 * Eine Wahl aus wenigen Moeglichkeiten - wie der Schalter oben in den
 * iOS-Einstellungen. Ab drei Woertern wird daraus schnell eine Zeile zu
 * viel, deshalb bleiben die Beschriftungen kurz.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tone = "plain",
  ariaLabel,
}: {
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  tone?: "plain" | "brand";
  ariaLabel?: string;
}) {
  return (
    <div className={`seg ${tone === "brand" ? "seg-brand" : ""}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Eine Person im Kreis: das Profilbild, sonst das Kuerzel des Namens
 * („Alex Krüger“ wird zu „AK“).
 */
export function Avatar({
  name,
  src,
  size = 28,
  tone = "brand",
  loading = false,
}: {
  name: string | null;
  /** Profilbild als Data-URL; ohne Bild erscheint das Kuerzel. */
  src?: string | null;
  size?: number;
  /** "light" fuer dunkle Flaechen wie die Seitenleiste. */
  tone?: "brand" | "muted" | "light";
  /** Zeigt einen Platzhalter, solange das Bild noch entsteht. */
  loading?: boolean;
}) {
  if (loading) {
    return (
      <span
        className="skeleton inline-block shrink-0 rounded-full"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  if (src) {
    return (
      // Das Bild steckt als Data-URL in den Teamdaten - kein Netzweg, den
      // next/image optimieren koennte.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{
          width: size,
          height: size,
          boxShadow: "inset 0 0 0 1px rgb(11 21 36 / 0.08)",
        }}
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
    : "–";
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background:
          tone === "brand"
            ? "color-mix(in srgb, var(--brand-500) 16%, transparent)"
            : tone === "light"
              ? "rgb(255 255 255 / 0.16)"
              : "color-mix(in srgb, var(--ink) 9%, transparent)",
        color:
          tone === "brand" ? "var(--tint)" : tone === "light" ? "#fff" : "var(--ink-muted)",
      }}
      title={name ?? "nicht zugeteilt"}
      aria-hidden
    >
      {short || "–"}
    </span>
  );
}

/** Hinweiszeile mit Symbol - fuer Erklaerungen, die nicht im Weg stehen sollen. */
export function Note({
  icon,
  children,
  tone = "neutral",
}: {
  icon?: ReactNode;
  children: ReactNode;
  tone?: Tone;
}) {
  const bg: Record<string, string> = {
    neutral: "color-mix(in srgb, var(--ink) 5%, transparent)",
    brand: "color-mix(in srgb, var(--brand-500) 9%, transparent)",
    success: "color-mix(in srgb, var(--energy-500) 11%, transparent)",
    warn: "color-mix(in srgb, var(--gas-500) 13%, transparent)",
    danger: "color-mix(in srgb, var(--signal-500) 11%, transparent)",
  };
  return (
    <div
      className="flex items-start gap-2.5 rounded-[var(--r-md)] px-3 py-2.5 text-[12px] leading-snug"
      style={{ background: bg[tone], color: tone === "neutral" ? "var(--ink-muted)" : TONE_INK[tone] }}
    >
      {icon && <span className="mt-px shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/** Ueberschrift einer Gruppe - klein, in Grossbuchstaben, wie in iOS-Listen. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="muted mb-2 ml-1 text-[12px] font-semibold uppercase tracking-[0.05em]">
      {children}
    </p>
  );
}

export function EmptyState({
  title,
  text,
  icon,
  action,
  bare = false,
}: {
  title: string;
  text?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** Ohne eigene Karte - fuer leere Abschnitte innerhalb einer Karte. */
  bare?: boolean;
}) {
  if (bare) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
        {icon && (
          <span
            className="mb-1 grid h-11 w-11 place-items-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--ink) 6%, transparent)",
              color: "var(--ink-muted)",
            }}
          >
            {icon}
          </span>
        )}
        <p className="text-[14px] font-semibold">{title}</p>
        {text && <p className="muted max-w-xs text-[13px] leading-snug">{text}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    );
  }
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
      {icon && (
        <span
          className="mb-1 grid h-14 w-14 place-items-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--brand-500) 10%, transparent)",
            color: "var(--tint)",
          }}
        >
          {icon}
        </span>
      )}
      <p className="text-[17px] font-semibold">{title}</p>
      {text && <p className="muted max-w-sm text-sm leading-relaxed">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ------------------------------ Ladezustaende ---------------------------- */

/**
 * Ein grauer Balken, der die Stelle eines Textes einnimmt.
 *
 * Die Rundung kommt als Wert und nicht als Klasse: so laesst sie sich fuer
 * groessere Flaechen (Karte, Kachel) ueberschreiben, ohne dass zwei
 * Rundungs-Klassen um den Vorrang streiten.
 */
export function SkeletonLine({
  width = "100%",
  height = 12,
  radius = 999,
  className = "",
}: {
  width?: string | number;
  height?: number;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      className={`skeleton block ${className}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}

/**
 * Platzhalter-Karte, solange die Daten unterwegs sind.
 *
 * Besser als ein Kreisel: die Seite steht schon an ihrem Platz und springt
 * nicht, wenn die Inhalte eintreffen.
 */
export function SkeletonCard({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`card space-y-2.5 p-4 ${className}`} aria-hidden>
      <SkeletonLine width="55%" height={14} />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? "70%" : "100%"} />
      ))}
    </div>
  );
}

/** Mehrere Platzhalter-Zeilen in einer Liste, je mit Kreis und zwei Balken. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="list" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3.5 py-3">
          <span className="skeleton h-9 w-9 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <SkeletonLine width={`${70 - i * 7}%`} height={13} />
            <SkeletonLine width={`${45 - i * 4}%`} height={10} />
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Ergebnisse ------------------------------ */

export const OUTCOME_LABEL: Record<string, string> = {
  SALE: "Abschluss",
  APPOINTMENT: "Termin",
  MET_NO_SALE: "Kein Abschluss",
  NOT_HOME: "Nicht angetroffen",
};

/** Farbe eines Ergebnisses - dieselbe in Listen, Klingelbrett und Verlauf. */
export function outcomeColor(outcome: string): string {
  if (outcome === "SALE") return "var(--ok-ink)";
  if (outcome === "APPOINTMENT") return "var(--tint)";
  if (outcome === "NOT_HOME") return "var(--ink-muted)";
  return "var(--danger-ink)";
}

/** Das Ergebnis eines Besuchs als farbiger Kreis mit Zeichen. */
export function OutcomeIcon({ outcome, size = 30 }: { outcome: string; size?: number }) {
  const color = outcomeColor(outcome);
  const glyph = size >= 30 ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span
      className="tile-icon shrink-0"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 13%, transparent)`,
        color,
      }}
      title={OUTCOME_LABEL[outcome]}
      aria-hidden
    >
      {outcome === "SALE" ? (
        <IconCheck className={glyph} />
      ) : outcome === "APPOINTMENT" ? (
        <IconCalendar className={glyph} />
      ) : outcome === "NOT_HOME" ? (
        <IconDoor className={glyph} />
      ) : (
        <IconChat className={glyph} />
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

/** "1 Straße" statt "1 Straßen". */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
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
