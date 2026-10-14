"use client";

import { useState } from "react";
import { LEVEL_TITLES, XP_RULES, xpForLevel, type LevelProgress } from "@/lib/levels";
import { Sheet } from "@/components/Sheet";
import { Cell, ListLabel } from "@/components/ui";
import { IconCheck, IconInfo } from "@/components/icons";

const number = (value: number) => value.toLocaleString("de-DE");

/** So zaehlt es: XP je Ergebnis und die Titel - auf Wunsch, nicht auf der Seite. */
export function LevelInfo({ progress }: { progress: LevelProgress }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="So zählt es">
        <IconInfo className="h-5 w-5" />
      </button>
      {open && (
        <Sheet title="So zählt es" onClose={() => setOpen(false)}>
          <ListLabel>XP je Besuch</ListLabel>
          <ul className="list">
            {XP_RULES.map((rule) => (
              <li key={rule.outcome}>
                <Cell
                  title={rule.label}
                  subtitle={rule.description}
                  detail={<span className="kpi font-semibold text-ink">+{rule.xp}</span>}
                />
              </li>
            ))}
          </ul>
          <p className="list-footer">
            Gelöschte Besuche ziehen ihre XP wieder ab. Abzeichen und Tagesziele geben keine zusätzlichen XP. Tage
            zählen nach Berliner Zeit.
          </p>

          <ListLabel>Titel</ListLabel>
          <ul className="list">
            {LEVEL_TITLES.map((title) => {
              const reached = progress.level >= title.level;
              return (
                <li key={title.level}>
                  <Cell
                    title={title.title}
                    subtitle={`Level ${title.level} · ${number(xpForLevel(title.level))} XP`}
                    trailing={reached ? <IconCheck className="h-5 w-5 text-accent-ink" /> : undefined}
                  />
                </li>
              );
            })}
          </ul>
        </Sheet>
      )}
    </>
  );
}
