"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { TIERS, rankLabel, tierIndex } from "@/lib/tiers";
import type { Tier } from "@/lib/types";
import { useRanks } from "./RanksContext";

/**
 * Einmal nach der Befoerderung: ein ganzer Bildschirm mit der Leiter, auf der
 * man eine Sprosse hochrueckt. "Weiter" meldet dem Server, dass die Feier
 * gesehen ist - sie kommt nicht wieder, auch nicht auf dem anderen Geraet.
 */
export function RankCelebration({ tier, name }: { tier: Tier; name: string }) {
  const router = useRouter();
  const ranks = useRanks();
  const [open, setOpen] = useState(true);
  const button = useRef<HTMLButtonElement>(null);
  const reached = tierIndex(tier);
  const first = name.split(/\s+/)[0] || name;

  useEffect(() => {
    button.current?.focus();
  }, []);

  function close(next?: string) {
    setOpen(false);
    void fetch("/api/ranks/celebration", { method: "POST" }).catch(() => undefined);
    if (next) router.push(next);
  }

  if (!open) return null;
  return (
    <div className="rank-celebration" role="dialog" aria-modal="true" aria-labelledby="rank-celebration-title">
      <div className="rank-celebration-body">
        <ol className="rank-celebration-ladder" aria-hidden="true">
          {[...TIERS].reverse().map((step) => {
            const index = tierIndex(step);
            const state = index === reached ? "now" : index < reached ? "done" : "open";
            return (
              <li key={step} className="rank-celebration-rung" data-state={state} style={{ "--rung": TIERS.length - 1 - index } as CSSProperties}>
                <span className="rank-celebration-dot" />
                <span className="rank-celebration-name">{rankLabel(step, ranks)}</span>
              </li>
            );
          })}
        </ol>
        <p className="rank-celebration-kicker">Glückwunsch, {first}</p>
        <h2 id="rank-celebration-title" className="rank-celebration-title">
          Du bist jetzt {rankLabel(tier, ranks)}
        </h2>
        <p className="rank-celebration-text">
          {reached === TIERS.length - 1
            ? "Ganz oben auf der Leiter. Ab jetzt gilt deine neue Provision."
            : "Ab jetzt gilt deine neue Provision. Die Ziele für den nächsten Rang stehen auf deiner Leiter."}
        </p>
      </div>
      <div className="rank-celebration-actions">
        <button ref={button} type="button" className="btn btn-primary btn-lg btn-block" onClick={() => close()}>
          Weiter
        </button>
        <button type="button" className="btn btn-plain btn-block" onClick={() => close("/team/stufen")}>
          Zur Karriereleiter
        </button>
      </div>
    </div>
  );
}
