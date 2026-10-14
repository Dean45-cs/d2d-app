/**
 * Wie weit ein Gebiet ist - ueberall gleich gerechnet. Mit Hausnummern
 * zaehlen die Haeuser, an denen schon jemand war (oder die gesperrt sind);
 * Besuche allein koennen mehr sein als Tueren (Wiederholungen, Klingeln).
 */
export interface Progress {
  done: number;
  total: number;
  /** "12 von 30 Häusern" */
  label: string;
}

export function territoryProgress(t: {
  house_count: number;
  house_touched_count: number;
  visit_count: number;
  unit_count: number;
}): Progress {
  if (t.house_count > 0) {
    return { done: t.house_touched_count, total: t.house_count, label: `${t.house_touched_count} von ${t.house_count} Häusern` };
  }
  if (t.unit_count > 0) {
    const done = Math.min(t.visit_count, t.unit_count);
    return { done, total: t.unit_count, label: `${done} von ${t.unit_count} Türen` };
  }
  return { done: 0, total: 0, label: `${t.visit_count.toLocaleString("de-DE")} ${t.visit_count === 1 ? "Tür" : "Türen"}` };
}

/** Anteil in ganzen Prozent, ohne Gesamtzahl null. */
export function progressShare(p: Progress): number | null {
  return p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : null;
}
