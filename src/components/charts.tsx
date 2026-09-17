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
 */
export function DailyBars({ data }: { data: DayPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="muted py-8 text-center text-sm">
        Noch keine Einträge im gewählten Zeitraum.
      </p>
    );
  }
  const max = Math.max(...data.map((d) => d.doors), 1);

  // Bei vielen Tagen nur jede zweite Datumsbeschriftung, sonst ueberlappen sie.
  const labelEvery = data.length > 9 ? 2 : 1;

  return (
    <figure className="m-0 flex h-full flex-col">
      <figcaption className="mb-3 flex flex-wrap items-center gap-4 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: "var(--chart-doors)" }}
          />
          Türen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: "var(--chart-sales)" }}
          />
          Abschlüsse
        </span>
      </figcaption>

      <div className="flex min-h-[10rem] flex-1 gap-1.5 overflow-x-auto pb-1">
        {data.map((d, index) => (
          <div
            key={d.day}
            className="flex h-full min-w-[26px] flex-1 flex-col items-center gap-1"
          >
            <span className="text-[10px] font-semibold tabular-nums muted">
              {d.doors || ""}
            </span>
            {/* flex-1 gibt der Balkenflaeche die restliche Hoehe der Spalte */}
            <div className="flex w-full flex-1 items-end justify-center gap-[2px]">
              <span
                className="w-1/2 rounded-t-[4px] transition-[height]"
                style={{
                  height: `${Math.max(2, (d.doors / max) * 100)}%`,
                  background: "var(--chart-doors)",
                }}
                title={`${d.doors} Türen am ${formatDay(d.day)}`}
              />
              <span
                className="w-1/2 rounded-t-[4px] transition-[height]"
                style={{
                  height: `${Math.max(d.sales ? 3 : 0, (d.sales / max) * 100)}%`,
                  background: "var(--chart-sales)",
                }}
                title={`${d.sales} Abschlüsse am ${formatDay(d.day)}`}
              />
            </div>
            <span className="muted h-3 whitespace-nowrap text-[10px]">
              {index % labelEvery === 0 ? formatDay(d.day) : ""}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Ablehnungsgründe als waagerechte Balken - eine Reihe, daher eine Farbe. */
export function ReasonBars({
  data,
}: {
  data: Array<{ id: number; label: string; emoji: string; count: number }>;
}) {
  if (data.length === 0) {
    return (
      <p className="muted py-8 text-center text-sm">
        Noch keine Ablehnungsgründe erfasst.
      </p>
    );
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.id} className="grid grid-cols-[1.25rem_1fr_3.75rem] items-center gap-2">
          <span aria-hidden className="text-center text-sm">
            {d.emoji || "💬"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm">{d.label}</span>
            <span
              className="mt-1 block h-2 rounded-[4px]"
              style={{
                width: `${Math.max(3, (d.count / max) * 100)}%`,
                background: "var(--chart-doors)",
              }}
            />
          </span>
          <span className="text-right text-sm font-semibold tabular-nums">
            {d.count}
            <span className="muted ml-1 text-[11px] font-normal">
              {Math.round((d.count / total) * 100)}%
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}
