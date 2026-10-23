import type { ReactNode } from "react";
import { LogoGlyph } from "./Logo";
import { SkeletonText } from "./ui";

export interface HeroStat {
  label: string;
  value: ReactNode;
  hint?: string;
}

/**
 * Kopfkarte der Uebersicht auf der Markenflaeche: gross das Ergebnis
 * (Abschluesse mit Quote), darunter der Weg dorthin - Tueren, Gespraeche,
 * Termine. Die einzige tiefgruene Flaeche der Seite; der Ring der Marke
 * liegt leise im Hintergrund.
 */
export function HeroStats({ lead, stats }: { lead: HeroStat; stats: HeroStat[] }) {
  return (
    <section className="hero" aria-label="Kennzahlen im Zeitraum">
      <LogoGlyph size={196} className="hero-mark" />
      <div className="hero-body">
        <div className="min-w-0">
          <p className="hero-label">{lead.label}</p>
          <p className="mt-1 flex items-center gap-3">
            <span className="kpi number-in text-display">{lead.value}</span>
            {lead.hint && <span className="hero-pill">{lead.hint}</span>}
          </p>
        </div>
        <dl className="hero-stats">
          {stats.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="hero-label truncate">{item.label}</dt>
              <dd className="kpi mt-0.5 truncate text-title-1">{item.value}</dd>
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
      <LogoGlyph size={196} className="hero-mark" />
      <div className="hero-body">
        <div className="min-w-0">
          <p className="hero-label">
            <SkeletonText width="6rem" />
          </p>
          <p className="mt-1 text-display">
            <SkeletonText width="4rem" />
          </p>
        </div>
        <div className="hero-stats">
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="min-w-0">
              <p className="hero-label">
                <SkeletonText width="70%" />
              </p>
              <p className="mt-0.5 text-title-1">
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
