/**
 * Zwei schlanke Diagramme, komplett aus HTML/CSS - keine Chart-Bibliothek.
 * Farben kommen aus den geprueften Tokens in brand.css.
 */

export interface DayPoint {
  day: string;
  doors: number;
  met: number;
  sales: number;
}

/**
 * Tagesverlauf: Türen und Abschlüsse als gruppierte Balken.
 * Beide Reihen zaehlen Stueck, also eine gemeinsame Achse.
 *
 * Die Hoehe ist fest: neben einer langen Liste wuerden die Balken sonst
 * mitwachsen und die Seite in die Laenge ziehen.
 */
export function DailyBars({ data, height = 184 }: { data: DayPoint[]; height?: number }) {
  if (data.length === 0) {
    return (
      <div className="grid place-items-center" style={{ height }}>
        <p className="muted text-center text-sm">Im gewählten Zeitraum wurde nichts erfasst.</p>
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.doors), 1);
  const totalDoors = data.reduce((sum, d) => sum + d.doors, 0);
  const totalSales = data.reduce((sum, d) => sum + d.sales, 0);

  // Bei vielen Tagen nur jede zweite Datumsbeschriftung, sonst ueberlappen sie.
  const labelEvery = data.length > 16 ? 3 : data.length > 9 ? 2 : 1;
  // Zahlen ueber den Balken nur, solange sie nebeneinander passen.
  const showValues = data.length <= 16;

  return (
    <figure className="m-0">
      <figcaption className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px]">
        <Legend color="var(--chart-doors)" label="Türen" value={totalDoors} />
        <Legend color="var(--chart-sales)" label="Abschlüsse" value={totalSales} />
      </figcaption>

      <div className="relative" style={{ height }}>
        {/* Drei ruhige Hilfslinien - der Blick braucht einen Massstab. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-5 top-4 flex flex-col justify-between" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="block border-t border-dashed" style={{ borderColor: "var(--chart-grid)" }} />
          ))}
        </div>

        <div className="relative flex h-full gap-1 overflow-x-auto">
          {data.map((d, index) => (
            <div key={d.day} className="flex h-full min-w-[18px] flex-1 flex-col items-center">
              <span className="muted h-4 text-[10px] font-semibold tabular-nums">
                {showValues && d.doors ? d.doors : ""}
              </span>
              <div className="flex w-full flex-1 items-end justify-center gap-[2px]">
                <span
                  className="w-[42%] max-w-3 rounded-t-[3px] transition-[height]"
                  style={{
                    height: `${Math.max(d.doors ? 2 : 0, (d.doors / max) * 100)}%`,
                    background: "var(--chart-doors)",
                  }}
                  title={`${d.doors} Türen am ${formatDay(d.day)}`}
                />
                <span
                  className="w-[42%] max-w-3 rounded-t-[3px] transition-[height]"
                  style={{
                    height: `${Math.max(d.sales ? 3 : 0, (d.sales / max) * 100)}%`,
                    background: "var(--chart-sales)",
                  }}
                  title={`${d.sales} Abschlüsse am ${formatDay(d.day)}`}
                />
              </div>
              <span className="muted h-5 whitespace-nowrap pt-1.5 text-[10px] tabular-nums">
                {index % labelEvery === 0 ? formatDay(d.day) : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
      <span className="muted">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

/** Ablehnungsgründe als waagerechte Balken - eine Reihe, daher eine Farbe. */
export function ReasonBars({
  data,
  limit,
}: {
  data: Array<{ id: number; label: string; emoji: string; count: number }>;
  /** Nur die haeufigsten zeigen; der Rest wird zu "Weitere" zusammengefasst. */
  limit?: number;
}) {
  if (data.length === 0) {
    return (
      <p className="muted py-10 text-center text-sm">Noch keine Ablehnungen im Zeitraum.</p>
    );
  }
  const total = data.reduce((sum, d) => sum + d.count, 0);
  let rows = data;
  if (limit && data.length > limit) {
    const rest = data.slice(limit - 1);
    rows = [
      ...data.slice(0, limit - 1),
      { id: -1, label: `${rest.length} weitere`, emoji: "", count: rest.reduce((s, d) => s + d.count, 0) },
    ];
  }
  const max = Math.max(...rows.map((d) => d.count), 1);

  return (
    <ul className="space-y-3">
      {rows.map((d) => (
        <li key={d.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className={`min-w-0 truncate ${d.id === -1 ? "muted" : ""}`}>{d.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold">{d.count}</span>
              <span className="muted ml-1.5 inline-block w-8 text-right text-[12px]">
                {Math.round((d.count / total) * 100)} %
              </span>
            </span>
          </div>
          <span
            className="block h-1.5 overflow-hidden rounded-full"
            style={{ background: "color-mix(in srgb, var(--ink) 7%, transparent)" }}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.max(3, (d.count / max) * 100)}%`,
                background: d.id === -1 ? "var(--ink-muted)" : "var(--chart-doors)",
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/**
 * Luecken fuellen: Tage ohne Eintrag fehlen in der Abfrage, gehoeren aber als
 * leere Spalte ins Bild - sonst rueckt der Verlauf zusammen und luegt.
 * Ab fuenf Wochen werden Wochen daraus, damit die Balken lesbar bleiben.
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
