import { useId } from "react";

/*
 * Carlsson Sales - Bildmarke und Schriftzug.
 *
 * Die Marke ist ein offener Ring: ein "C", das zugleich ein Fortschrittsring
 * ist, und in seiner Oeffnung der Punkt, der ihn gleich schliesst - Energie,
 * Schwung, der naechste Abschluss. Der Ring waechst von 3 Uhr bis 12 Uhr von
 * schmal zu breit und laeuft so auf den Punkt zu. Dieselbe Geometrie steckt
 * in public/icon.svg, public/logo.svg, public/logo-mark.svg und den daraus
 * erzeugten PNGs (scripts/build-icons.mjs).
 */

/** Ring als Flaeche (Mitte 50/50, Radius 29, Strich 7 -> 14.5) auf 100er-Raster. */
export const MARK_RING =
  "M82.5 50C82.54 54.25 81.74 58.52 80.17 62.5C78.6 66.47 76.24 70.15 73.26 73.26C70.28 76.37 66.68 78.91 62.71 80.68C58.74 82.45 54.39 83.44 50 83.57C45.61 83.7 41.16 82.95 37 81.38C32.84 79.8 28.97 77.39 25.69 74.31C22.41 71.22 19.73 67.47 17.86 63.31C15.99 59.16 14.95 54.61 14.82 50C14.69 45.39 15.49 40.74 17.16 36.4C18.84 32.06 21.4 28.03 24.65 24.65C27.9 21.27 31.85 18.53 36.19 16.65C40.53 14.78 45.25 13.79 50 13.75A7.25 7.25 0 0 1 50 28.25C47.15 28.21 44.29 28.73 41.62 29.76C38.94 30.8 36.45 32.35 34.34 34.34C32.22 36.32 30.48 38.73 29.25 41.41C28.02 44.08 27.31 47.01 27.18 50C27.05 52.99 27.52 56.02 28.55 58.88C29.59 61.74 31.21 64.42 33.29 66.71C35.38 68.99 37.95 70.88 40.8 72.21C43.66 73.54 46.8 74.3 50 74.43C53.2 74.56 56.45 74.04 59.49 72.9C62.53 71.77 65.36 70.01 67.75 67.75C70.14 65.49 72.08 62.74 73.41 59.7C74.75 56.66 75.46 53.34 75.5 50A3.5 3.5 0 0 1 82.5 50Z";
export const MARK_DOT = { cx: 71.2, cy: 28.8, r: 6.75 };

/**
 * Bildmarke im App-Symbol-Format: gerundetes Quadrat in Energie-Gruen mit
 * Licht von oben links, feiner Lichtkante und einer hellen Marke, die einen
 * weichen Schatten wirft. Der Punkt leuchtet leicht.
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const ref = (name: string) => `url(#${id}-${name})`;
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
          <stop offset="0" stopColor="#46e38e" />
          <stop offset=".52" stopColor="#17a852" />
          <stop offset="1" stopColor="#06612f" />
        </linearGradient>
        <radialGradient id={`${id}-light`} cx=".2" cy=".08" r=".9">
          <stop offset="0" stopColor="#fff" stopOpacity=".3" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset=".3" stopColor="#fff" stopOpacity="0" />
          <stop offset=".75" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".16" />
        </linearGradient>
        <linearGradient id={`${id}-ring`} x1=".1" y1=".1" x2=".9" y2=".9">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#cff7de" />
        </linearGradient>
        <radialGradient id={`${id}-dot`} cx=".36" cy=".3" r=".8">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#d4f9e1" />
        </radialGradient>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0" stopColor="#f0fff5" stopOpacity=".8" />
          <stop offset=".42" stopColor="#bdffd6" stopOpacity=".3" />
          <stop offset="1" stopColor="#bdffd6" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      <rect width="100" height="100" rx="22.4" fill={ref("bg")} />
      <rect width="100" height="100" rx="22.4" fill={ref("light")} />
      <rect x=".5" y=".5" width="99" height="99" rx="21.9" fill="none" stroke={ref("rim")} />
      <g fill="#00361a" opacity=".3" filter={ref("shadow")} transform="translate(0 2.2)">
        <path d={MARK_RING} />
        <circle {...MARK_DOT} />
      </g>
      <circle cx={MARK_DOT.cx} cy={MARK_DOT.cy} r="16" fill={ref("halo")} />
      <path d={MARK_RING} fill={ref("ring")} />
      <circle {...MARK_DOT} fill={ref("dot")} />
    </svg>
  );
}

/** Nur die Form, einfarbig in der Schriftfarbe - etwa auf Glas. */
export function LogoGlyph({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={MARK_RING} fill="currentColor" />
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
