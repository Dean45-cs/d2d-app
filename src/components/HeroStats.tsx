import type { ReactNode } from "react";
import { SkeletonText } from "./ui";

export interface HeroStat {
  label: string;
  value: ReactNode;
  hint?: string;
}

/**
 * Kopf der Uebersicht: gross das Ergebnis (Abschluesse mit Quote), darunter
 * der Weg dorthin - Tueren, Gespraeche, Termine. Eine ruhige Flaeche wie die
 * Zusammenfassungen in Health und Fitness: die Beschriftung im Akzent, die
 * Zahl gross, sonst nichts.
 */
export function HeroStats({
  lead,
  stats,
  section,
}: {
  lead: HeroStat;
  stats: HeroStat[];
  /** Abschnitt der Uebersicht, der sich ausblenden laesst (data-start). */
  section?: string;
}) {
  return (
    <section className="hero" aria-label="Kennzahlen im Zeitraum" data-start={section}>
      <div className="hero-body">
        <div className="min-w-0">
          <p className="hero-lead-label">{lead.label}</p>
          <p className="flex items-baseline gap-2.5">
            <span className="kpi number-in hero-value">{lead.value}</span>
            {lead.hint && <span className="hero-note">{lead.hint}</span>}
          </p>
        </div>
        <dl className="hero-stats">
          {stats.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="hero-label truncate">{item.label}</dt>
              <dd className="kpi truncate text-title-1">{item.value}</dd>
              {item.hint && <dd className="hero-hint">{item.hint}</dd>}
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** Platzhalter in derselben Form - beim Laden springt nichts. */
export function SkeletonHero({ stats = 3 }: { stats?: number }) {
  return (
    <section className="hero" aria-hidden="true">
      <div className="hero-body">
        <div className="min-w-0">
          <p className="hero-lead-label">
            <SkeletonText width="6rem" />
          </p>
          <p className="hero-value">
            <SkeletonText width="4rem" />
          </p>
        </div>
        <div className="hero-stats">
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="min-w-0">
              <p className="hero-label">
                <SkeletonText width="70%" />
              </p>
              <p className="text-title-1">
                <SkeletonText width="45%" />
              </p>
              <p className="hero-hint">
                <SkeletonText width="80%" />
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
