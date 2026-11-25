import type { DailyGoal } from "@/lib/levels";

const number = (value: number) => value.toLocaleString("de-DE");


const RING_COLORS: Record<string, string> = {
  doors: "var(--chart-doors)",
  met: "var(--chart-met)",
  sales: "var(--chart-sales)",
};

const RING_LABEL: Record<string, string> = {
  doors: "Türen",
  met: "Gespräche",
  sales: "Abschluss",
};

/**
 * Die Tagesziele als Ringe wie in Fitness: aussen Tueren, dann Gespraeche,
 * innen der Abschluss. Ein geschlossener Ring ist ein erreichtes Ziel;
 * die Liste daneben sagt dasselbe in Zahlen.
 */
export function ActivityRings({ goals, size = 132 }: { goals: DailyGoal[]; size?: number }) {
  const stroke = Math.round(size / 9);
  const gap = 3;
  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden="true">
        {goals.map((goal, index) => {
          const radius = size / 2 - stroke / 2 - index * (stroke + gap);
          const circumference = 2 * Math.PI * radius;
          const share = goal.target > 0 ? Math.min(1, goal.current / goal.target) : 0;
          const color = RING_COLORS[goal.id] ?? "var(--accent)";
          return (
            <g key={goal.id}>
              <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={stroke} />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - share)}
                className="transition-[stroke-dashoffset] duration-700 ease-spring"
              />
            </g>
          );
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-3">
        {goals.map((goal) => (
          <li key={goal.id} className="min-w-0">
            <span className="flex items-center gap-2 text-footnote font-semibold text-ink-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RING_COLORS[goal.id] }} aria-hidden="true" />
              {RING_LABEL[goal.id] ?? goal.title}
            </span>
            <span className="kpi block text-title-3">
              {number(goal.current)}
              <span className="text-subhead font-semibold text-muted">/{number(goal.target)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
