import type { ReactNode } from "react";

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
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        {subtitle && <p className="muted mt-0.5 text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "brand" | "success" | "warn" | "danger";
}) {
  const tones: Record<string, string> = {
    neutral: "text-[var(--ink)]",
    brand: "text-brand-600",
    success: "text-energy-600",
    warn: "text-gas-600",
    danger: "text-signal-600",
  };
  return (
    <div className="card px-4 py-3">
      <p className="muted text-[11px] font-semibold uppercase tracking-wider">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      {hint && <p className="muted mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  tone = "brand",
}: {
  value: number;
  max: number;
  tone?: "brand" | "success";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ background: "color-mix(in srgb, var(--ink) 10%, transparent)" }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${pct}%`,
          background: tone === "success" ? "var(--energy-500)" : "var(--brand-500)",
        }}
      />
    </div>
  );
}

const STATUS_STYLES: Record<string, { label: string; bg: string; fg: string }> = {
  OPEN: { label: "Offen", bg: "color-mix(in srgb, var(--ink) 10%, transparent)", fg: "var(--ink-muted)" },
  ACTIVE: { label: "In Arbeit", bg: "color-mix(in srgb, var(--brand-500) 15%, transparent)", fg: "var(--brand-600)" },
  DONE: { label: "Fertig", bg: "color-mix(in srgb, var(--energy-500) 18%, transparent)", fg: "var(--energy-700)" },
  PAUSED: { label: "Pausiert", bg: "color-mix(in srgb, var(--gas-500) 18%, transparent)", fg: "var(--gas-600)" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.OPEN;
  return (
    <span className="badge" style={{ background: style.bg, color: style.fg }}>
      {style.label}
    </span>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="muted max-w-sm text-sm">{text}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
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
