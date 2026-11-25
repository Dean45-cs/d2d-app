import { SegmentedLinks, SkeletonHeader, SkeletonText } from "@/components/ui";
import { TIER_LABEL, TIERS } from "@/lib/tiers";
import { TEAM_VIEWS } from "../views";

/** Platzhalter der Karriereleiter - die Sprossen stehen schon, grau sind nur die Leute. */
export default function LoadingCareer() {
  return (
    <div className="page" aria-busy="true" aria-label="Karriereleiter wird geladen">
      <SkeletonHeader title="Karriere">
        <SegmentedLinks ariaLabel="Team" current="stufen" options={TEAM_VIEWS} className="max-w-md seg-tight" />
      </SkeletonHeader>
      <ol className="ladder" aria-hidden="true">
        {[...TIERS].reverse().map((tier) => (
          <li key={tier} className="ladder-rung" data-state="open">
            <span className="ladder-mark" />
            <div className="ladder-body surface">
              <p className="text-headline">{TIER_LABEL[tier]}</p>
              <div className="mt-2 flex gap-2">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="skeleton h-10 w-10 rounded-full" />
                ))}
              </div>
              <span className="mt-2 block text-footnote">
                <SkeletonText width="40%" />
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
