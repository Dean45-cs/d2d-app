import { useId } from "react";

/*
 * Carlsson Sales - Bildmarke und Schriftzug.
 *
 * Die Marke ist ein offener Ring: ein "C", das zugleich ein Fortschrittsring
 * ist, und in seiner Oeffnung der Punkt, der ihn gleich schliesst - Energie,
 * Schwung, der naechste Abschluss. Dieselbe Geometrie steckt in
 * public/logo-mark.svg, public/icon.svg und den daraus erzeugten PNGs
 * (scripts/build-icons.mjs).
 */

/** Ring und Punkt auf 100er-Raster - fuer alle Groessen dieselbe Form. */
export const MARK_RING = "M80 50A30 30 0 1 1 50 20";
export const MARK_DOT = { cx: 71.2, cy: 28.8, r: 6.5 };

/** Bildmarke im App-Symbol-Format (gerundetes Quadrat in Energie-Gruen). */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`shrink-0 ${className}`}
      role="img"
      aria-label="Carlsson Sales"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3ee07e" />
          <stop offset="1" stopColor="#0e8a43" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22.4" fill={`url(#${id}-bg)`} />
      <path d={MARK_RING} fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round" />
      <circle {...MARK_DOT} fill="#fff" />
    </svg>
  );
}

/** Nur die Form, einfarbig in der Schriftfarbe - etwa auf Glas. */
export function LogoGlyph({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={MARK_RING} fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" />
      <circle {...MARK_DOT} fill="currentColor" />
    </svg>
  );
}

/** Bildmarke mit Schriftzug in der Systemschrift. */
export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="whitespace-nowrap text-headline tracking-[-0.02em]">
        Carlsson <span className="font-normal text-ink-2">Sales</span>
      </span>
    </span>
  );
}
