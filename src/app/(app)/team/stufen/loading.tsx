import type { CSSProperties } from "react";
import { SegmentedLinks, SkeletonHeader, SkeletonText } from "@/components/ui";
import { TIER_LABEL } from "@/lib/tiers";
import { TEAM_VIEWS } from "../views";

/** So viele Bilder zeigt der Platzhalter je Stufe - nach unten mehr, wie in jedem Team. */
const STEPS = [
  { label: "Geschäftsführung", people: 1 },
  { label: TIER_LABEL.TEAMLEITER, people: 2 },
  { label: TIER_LABEL.SENIOR, people: 3 },
  { label: TIER_LABEL.BERATER, people: 5 },
];

/** Platzhalter der Stufen - die Pyramide steht schon, grau sind nur die Leute. */
export default function LoadingTiers() {
  return (
    <div className="page" aria-busy="true" aria-label="Stufen werden geladen">
      <SkeletonHeader title="Stufen">
        <SegmentedLinks ariaLabel="Team" current="stufen" options={TEAM_VIEWS} className="max-w-md seg-tight" />
      </SkeletonHeader>
      <div className="pyramid" aria-hidden="true">
        {STEPS.map((step, index) => (
          <div key={step.label} className="pyramid-step surface" style={{ "--step": index } as CSSProperties}>
            <p className="text-headline">{step.label}</p>
            <div className="pyramid-people">
              {Array.from({ length: step.people }, (_, i) => (
                <span key={i} className="pyramid-person">
                  <span className="skeleton h-12 w-12 rounded-full" />
                  <span className="block w-full text-footnote">
                    <SkeletonText width="70%" />
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
