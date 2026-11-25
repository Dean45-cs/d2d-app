import Link from "next/link";
import type { CSSProperties } from "react";
import { IconChevronRight } from "@/components/icons";
import type { CareerSummary } from "@/lib/ranks-model";
import { TIERS, tierIndex } from "@/lib/tiers";

/**
 * Der eigene Rang auf einen Blick - oben auf Provisionen und im Profil.
 * Links Rang und was zum naechsten fehlt, rechts die vier Sprossen mit der
 * eigenen markiert. Fuehrt zur Karriereleiter.
 */
export function RankCard({
  career,
  label = "Dein Rang",
  href = "/team/stufen",
}: {
  career: CareerSummary;
  label?: string;
  href?: string;
}) {
  const index = tierIndex(career.tier);
  const status = career.next === null
    ? "Höchster Rang erreicht"
    : career.ready
      ? `Bereit für ${career.nextLabel} – die Geschäftsführung prüft deinen Aufstieg`
      : career.goals.length === 0
        ? `Ziele für ${career.nextLabel} folgen`
        : `${career.summary} bis ${career.nextLabel}`;
  const pct = Math.round(career.ratio * 100);

  return (
    <Link href={href} className="rank-card surface" aria-label={`${label}: ${career.label}. ${status}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-footnote font-semibold text-muted">{label}</span>
        <span className="block truncate text-title-3 font-semibold">{career.label}</span>
        <span className={`mt-1 block text-footnote ${career.ready ? "font-semibold text-accent-ink" : "text-muted"}`}>{status}</span>
        {career.next !== null && career.goals.length > 0 && !career.ready && (
          <span className="rank-card-bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
      </span>
      <span className="rank-card-rungs" aria-hidden="true">
        {[...TIERS].reverse().map((tier) => {
          const step = tierIndex(tier);
          return (
            <span
              key={tier}
              className="rank-card-rung"
              data-state={step === index ? "now" : step < index ? "done" : step === index + 1 && career.ready ? "ready" : "open"}
              style={{ "--rung": step } as CSSProperties}
            />
          );
        })}
      </span>
      <IconChevronRight className="cell-chevron" />
    </Link>
  );
}
