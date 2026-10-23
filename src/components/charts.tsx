import { IconMore } from "./icons";
import { ReasonTile } from "./ReasonIcon";

/**
 * Schlanke Diagramme aus HTML/CSS - keine Bibliothek. Tueren neutral,
 * Abschluesse im Akzent; jede Reihe traegt zusaetzlich ihre Beschriftung,
 * damit nichts allein an der Farbe haengt.
 */

export interface DayPoint {
  day: string;
  doors: number;
  met: number;
  sales: number;
}

/**
 * Verlauf: Tueren und Abschluesse als gepaarte Saeulen auf gemeinsamer
 * Achse. Feste Hoehe, damit die Seite beim Laden nicht springt.
 */
export function DailyBars({ data, height = 168 }: { data: DayPoint[]; height?: number }) {
  if (data.length === 0 || data.every((d) => d.doors === 0)) {
    return (
      <div className="grid place-items-center" style={{ height }}>
        <p className="text-subhead text-muted">Noch nichts erfasst.</p>
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.doors), 1);
  const labelEvery = data.length > 16 ? 4 : data.length > 9 ? 2 : 1;
  const weekly = data.length > 1 && dayGap(data[0].day, data[1].day) > 1;

  return (
    <figure className="m-0">
      <div className="relative" style={{ height }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between" aria-hidden="true">
          <span className="flex items-center gap-2">
            <span className="h-px flex-1 bg-separator" />
            <span className="text-caption-2 text-muted">{max}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="h-px flex-1 bg-separator" />
            <span className="text-caption-2 text-muted">0</span>
          </span>
        </div>
        <ol className="relative flex h-full gap-1 pr-8">
          {data.map((d, index) => (
            <li key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center">
              <div
                className="flex w-full flex-1 items-end justify-center"
                title={`${formatDay(d.day, weekly)}: ${d.doors} Türen, ${d.sales} Abschlüsse`}
              >
                {/* Eine Saeule je Tag: die Tueren als ruhige Spur, die Abschluesse
                    darin von unten im Akzent - der Anteil ist die Quote. */}
                <span
                  className="relative w-full max-w-3 overflow-hidden rounded-full bg-[var(--chart-doors-soft)]"
                  style={{ height: `${d.doors ? Math.max(4, (d.doors / max) * 100) : 0}%` }}
                >
                  {d.sales > 0 && (
                    <span
                      className="absolute inset-x-0 bottom-0 rounded-full bg-[var(--chart-sales)]"
                      style={{ height: `${Math.min(100, (d.sales / Math.max(d.doors, 1)) * 100)}%`, minHeight: 6 }}
                    />
                  )}
                </span>
                <span className="sr-only">
                  {formatDay(d.day, weekly)}: {d.doors} Türen, {d.sales} Abschlüsse
                </span>
              </div>
              <span className="h-6 whitespace-nowrap pt-2 text-caption-2 text-muted">
                {index % labelEvery === 0 ? shortDay(d.day) : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-footnote text-ink-2">
        <Legend color="var(--chart-doors-soft)" label="Türen" />
        <Legend color="var(--chart-sales)" label="Abschlüsse" />
        {weekly && <span className="text-muted">je Woche</span>}
      </figcaption>
    </figure>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Ablehnungsgruende als Zeilen mit schmalem Balken - vorn die Kachel des Grundes. */
export function ReasonBars({
  data,
  limit,
}: {
  data: Array<{ id: number; label: string; icon: string; count: number }>;
  /** Nur die haeufigsten zeigen; der Rest wird zu "weitere". */
  limit?: number;
}) {
  if (data.length === 0) {
    return <p className="px-4 py-8 text-center text-subhead text-muted">Keine Ablehnungen im Zeitraum.</p>;
  }
  const total = data.reduce((sum, d) => sum + d.count, 0);
  let rows = data;
  if (limit && data.length > limit) {
    const rest = data.slice(limit - 1);
    rows = [
      ...data.slice(0, limit - 1),
      { id: -1, label: `${rest.length} weitere`, icon: "", count: rest.reduce((s, d) => s + d.count, 0) },
    ];
  }
  const max = Math.max(...rows.map((d) => d.count), 1);

  return (
    <ul className="list">
      {rows.map((d) => (
        <li key={d.id} className="cell">
          {d.id === -1 ? (
            <span className="glyph" aria-hidden="true">
              <IconMore className="h-4 w-4" />
            </span>
          ) : (
            <ReasonTile name={d.icon} />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className={`truncate text-subhead ${d.id === -1 ? "text-muted" : ""}`}>{d.label}</span>
              <span className="shrink-0 text-subhead font-semibold">
                {d.count}
                <span className="ml-2 inline-block w-10 text-right font-normal text-muted">
                  {Math.round((d.count / total) * 100)} %
                </span>
              </span>
            </span>
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-fill">
              <span
                className="block h-full rounded-full bg-[var(--chart-doors)]"
                style={{ width: `${Math.max(3, (d.count / max) * 100)}%` }}
              />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Antreffquote nach Tageszeit - die beste Zeit ist hervorgehoben. */
export function HourBars({ hours }: { hours: Array<{ label: string; total: number; met: number }> }) {
  const best = hours.reduce<{ label: string; total: number; met: number } | null>(
    (top, h) => (h.total >= 5 && (!top || h.met / h.total > top.met / top.total) ? h : top),
    null,
  );
  return (
    <div className="grid grid-cols-4 gap-2">
      {hours.map((h) => {
        const rate = h.total ? h.met / h.total : 0;
        const isBest = h === best;
        return (
          <div key={h.label} className="text-center">
            <div className="mx-auto flex h-16 w-full max-w-12 items-end overflow-hidden rounded-md bg-fill">
              <div
                className={`w-full rounded-md ${isBest ? "bg-accent" : "bg-[var(--chart-doors)]"}`}
                style={{ height: `${Math.max(4, rate * 100)}%`, opacity: h.total ? 1 : 0.25 }}
              />
            </div>
            <p className={`mt-1 text-footnote font-semibold ${isBest ? "text-accent-ink" : ""}`}>
              {h.total ? `${Math.round(rate * 100)} %` : "–"}
            </p>
            <p className="text-caption text-muted">{h.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function dayGap(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function formatDay(day: string, weekly: boolean): string {
  const date = new Date(`${day}T00:00:00Z`);
  const text = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return weekly ? `Woche ab ${text}` : text;
}

/** "12.09." - bei Wochen der Montag. */
function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Luecken fuellen: Tage ohne Eintrag fehlen in der Abfrage, gehoeren aber als
 * leere Spalte ins Bild. Ab fuenf Wochen werden Wochen daraus.
 */
export function fillDays(data: DayPoint[], days: number, now = new Date()): DayPoint[] {
  const byDay = new Map(data.map((d) => [d.day, d]));
  const filled: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    filled.push(byDay.get(day) ?? { day, doors: 0, met: 0, sales: 0 });
  }
  if (days <= 35) return filled;

  const weeks = new Map<string, DayPoint>();
  for (const point of filled) {
    const date = new Date(`${point.day}T00:00:00Z`);
    const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const week = weeks.get(monday) ?? { day: monday, doors: 0, met: 0, sales: 0 };
    week.doors += point.doors;
    week.met += point.met;
    week.sales += point.sales;
    weeks.set(monday, week);
  }
  return [...weeks.values()];
}
