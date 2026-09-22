import type { CSSProperties, ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight md:text-[32px]">{title}</h1>
        {subtitle && (
          <p className="muted mt-1 max-w-xl text-[13px] leading-snug md:text-sm">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

const TONE_INK: Record<string, string> = {
  neutral: "var(--ink)",
  brand: "var(--brand-600)",
  success: "var(--energy-600)",
  warn: "var(--gas-600)",
  danger: "var(--signal-600)",
};

export type Tone = keyof typeof TONE_INK;

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
  return (
    <div className="card px-3.5 py-3">
      <p className="muted text-[10px] font-bold uppercase tracking-[0.07em]">{label}</p>
      <p
        className="mt-0.5 text-[26px] font-bold leading-none tabular-nums"
        style={{ color: TONE_INK[tone], letterSpacing: "-0.02em" }}
      >
        {value}
      </p>
      {hint && <p className="muted mt-1 text-[11px] leading-tight">{hint}</p>}
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
  ACTIVE: { label: "In Arbeit", bg: "color-mix(in srgb, var(--brand-500) 15%, transparent)", fg: "var(--brand-600)" },
  DONE: { label: "Fertig", bg: "color-mix(in srgb, var(--energy-500) 18%, transparent)", fg: "var(--energy-700)" },
  PAUSED: { label: "Pausiert", bg: "color-mix(in srgb, var(--gas-500) 20%, transparent)", fg: "var(--gas-600)" },
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
    brand: { bg: "color-mix(in srgb, var(--brand-500) 14%, transparent)", fg: "var(--brand-600)" },
    success: { bg: "color-mix(in srgb, var(--energy-500) 17%, transparent)", fg: "var(--energy-700)" },
    warn: { bg: "color-mix(in srgb, var(--gas-500) 20%, transparent)", fg: "var(--gas-600)" },
    danger: { bg: "color-mix(in srgb, var(--signal-500) 15%, transparent)", fg: "var(--signal-600)" },
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

/** Kuerzel einer Person im Kreis - „Alex Krüger“ wird zu „AK“. */
export function Avatar({
  name,
  size = 28,
  tone = "brand",
}: {
  name: string | null;
  size?: number;
  tone?: "brand" | "muted";
}) {
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
            : "color-mix(in srgb, var(--ink) 9%, transparent)",
        color: tone === "brand" ? "var(--brand-600)" : "var(--ink-muted)",
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
    <p className="muted mb-1.5 ml-1 text-[11px] font-bold uppercase tracking-[0.06em]">
      {children}
    </p>
  );
}

export function EmptyState({
  title,
  text,
  icon,
  action,
}: {
  title: string;
  text: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
      {icon && (
        <span
          className="mb-1 grid h-14 w-14 place-items-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--brand-500) 10%, transparent)",
            color: "var(--brand-600)",
          }}
        >
          {icon}
        </span>
      )}
      <p className="text-[17px] font-semibold">{title}</p>
      <p className="muted max-w-sm text-sm leading-relaxed">{text}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
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
