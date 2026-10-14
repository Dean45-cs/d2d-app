"use client";

import { Children, useState, type ReactNode } from "react";

/**
 * Eine lange Liste zeigt erst die ersten Eintraege - der Rest kommt auf
 * Wunsch. So bleibt die Seite kurz, ohne dass etwas verloren geht.
 */
export function ShowMore({
  children,
  initial = 8,
  className = "",
}: {
  children: ReactNode;
  initial?: number;
  /** Klassen der Liste (<ul>). */
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const items = Children.toArray(children);
  const hidden = items.length - initial;
  return (
    <>
      <ul className={className}>{all ? items : items.slice(0, initial)}</ul>
      {hidden > 0 && !all && (
        <button type="button" className="btn btn-plain btn-sm mt-2" onClick={() => setAll(true)}>
          {hidden} weitere
        </button>
      )}
    </>
  );
}
