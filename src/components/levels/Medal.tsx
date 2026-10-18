import { useId, type ReactNode } from "react";
import type { AchievementTier } from "@/lib/levels";

/*
 * Medaille eines erreichten Abzeichens - gepraegt im Metall seiner Stufe.
 * Aufbau von aussen nach innen: Rand (Licht oben links), eingelassene
 * Kante (umgekehrtes Licht), Spiegel mit Glanz; ab Gold ein Perlkranz im
 * Rand, beim Diamanten Facetten und ein Funkeln. Das Zeichen sitzt
 * eingraviert in der dunkelsten Farbe des Metalls.
 *
 * Die Metalle sind Bildfarben wie die des Logos, keine Bedienfarben - sie
 * erscheinen nur hier und sehen hell wie dunkel gleich aus.
 */

type Metal = { light: string; base: string; deep: string; ink: string };

const METALS: Record<AchievementTier, Metal> = {
  bronze: { light: "#f3c79d", base: "#c27a45", deep: "#7f4520", ink: "#4f260c" },
  silver: { light: "#ffffff", base: "#c9ced6", deep: "#7e8796", ink: "#3b414b" },
  gold: { light: "#fff3bf", base: "#f1c44d", deep: "#a8760a", ink: "#5c3d00" },
  platinum: { light: "#f4f2ff", base: "#b4b4dc", deep: "#5d5f96", ink: "#25264f" },
  diamond: { light: "#effcff", base: "#8fdcf2", deep: "#2f8fbf", ink: "#0a3d5c" },
};

/** Ab welcher Stufe der Perlkranz im Rand erscheint. */
const BEADED: AchievementTier[] = ["gold", "platinum", "diamond"];

export function Medal({ tier, size, children }: { tier: AchievementTier; size: number; children?: ReactNode }) {
  const id = useId().replace(/:/g, "");
  const metal = METALS[tier];
  const ref = (name: string) => `url(#${id}-${name})`;
  return (
    <span className="medal" style={{ width: size, height: size, color: metal.ink }} aria-hidden="true">
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={metal.light} />
            <stop offset=".5" stopColor={metal.base} />
            <stop offset="1" stopColor={metal.deep} />
          </linearGradient>
          <linearGradient id={`${id}-bevel`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={metal.deep} />
            <stop offset="1" stopColor={metal.light} />
          </linearGradient>
          <radialGradient id={`${id}-face`} cx=".34" cy=".28" r=".9">
            <stop offset="0" stopColor={metal.light} />
            <stop offset=".55" stopColor={metal.base} />
            <stop offset="1" stopColor={metal.deep} />
          </radialGradient>
          <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="1">
            <stop offset=".1" stopColor="#fff" stopOpacity=".55" />
            <stop offset=".46" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill={ref("rim")} />
        {BEADED.includes(tier) && (
          <circle
            cx="50"
            cy="50"
            r="44.5"
            fill="none"
            stroke="#fff"
            strokeOpacity=".55"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray="0 6.99"
          />
        )}
        <circle cx="50" cy="50" r="41" fill={ref("bevel")} />
        <circle cx="50" cy="50" r="38.5" fill={ref("face")} />
        {tier === "diamond" && (
          <g stroke="#fff" strokeOpacity=".28" strokeWidth=".8">
            <path d="M50 11.5v77M11.5 50h77M22.8 22.8l54.4 54.4M77.2 22.8 22.8 77.2" />
            <circle cx="50" cy="50" r="24" fill="none" />
          </g>
        )}
        <circle cx="50" cy="50" r="38.5" fill={ref("sheen")} />
        {tier === "diamond" && (
          <path d="M80 9.5c.6 3.4 1.6 4.4 5 5-3.4.6-4.4 1.6-5 5-.6-3.4-1.6-4.4-5-5 3.4-.6 4.4-1.6 5-5Z" fill="#fff" />
        )}
      </svg>
      {children !== undefined && <span className="medal-mark">{children}</span>}
    </span>
  );
}
