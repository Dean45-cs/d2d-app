"use client";

import type { DailyGoal } from "@/lib/levels";
import { usePrefs } from "@/components/PrefsSync";
import { dailyTargets } from "@/lib/preferences";
import { ActivityRings } from "./LevelCard";

/**
 * Die Tagesziele unter "Erfolge" mit den eigenen Zielen aus den
 * Einstellungen - gezaehlt hat der Server, das Ziel setzt jeder selbst.
 */
export function DailyGoals({ goals }: { goals: DailyGoal[] }) {
  const prefs = usePrefs();
  const targets = dailyTargets(prefs) as Record<string, number>;
  const own = goals.map((goal) => {
    const target = targets[goal.id] ?? goal.target;
    return { ...goal, target, completed: goal.current >= target };
  });
  const done = own.filter((goal) => goal.completed).length;
  return (
    <>
      <ActivityRings goals={own} />
      <p className="mt-4 text-footnote text-muted">
        {done === own.length ? "Alle Tagesziele geschafft" : `${done} von ${own.length} Zielen`}
      </p>
    </>
  );
}
