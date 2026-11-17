"use client";

import { forwardRef, type ReactNode } from "react";
import type { Sketch, SketchAmount } from "@/lib/tariff-sketch";

/*
 * Die Rechnung als Skizze auf Karopapier - wie mit dem Kugelschreiber vor
 * dem Kunden geschrieben. Ein Bild, kein Bedienelement: darum eigene Farben
 * (Papier, blauer Stift, Rot fuers Durchstreichen, Gruen fuer die Ersparnis),
 * die mit Thema und Hell/Dunkel nicht wechseln - auch nicht im geteilten Bild.
 *
 * Aufgebaut in vier Schritten (`step`), damit der Berater Zeile fuer Zeile
 * erklaeren kann:
 *   1. heute   2. neu (mit Bonus)   3. Ersparnis je Jahr und gesamt   4. Abschlag
 * Die Seite bleibt dabei gleich hoch - nichts springt, es kommt nur Schrift dazu.
 */

export const SKETCH_STEPS = 4;

/** Mindestbreite des Papiers - bei langen Betraegen wird es breiter und als Ganzes kleiner. */
const MIN_W = 360;
const PAPER = "#fffdf6";
const GRID = "#dfe6ef";
const PEN = "#1f3a8c";
const RED = "#c62828";
const GREEN = "#15803d";
/** Handschrift aus dem System: Noteworthy (iPhone, iPad, Mac), sonst die naechste Schreibschrift. */
export const HAND = `"Noteworthy", "Marker Felt", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive`;

const X_LABEL = 14;
const GAP = 16;

let measure: CanvasRenderingContext2D | null | undefined;

/**
 * Breite einer Zeile in der Schrift, die das Geraet wirklich hat (auf dem
 * iPhone Noteworthy, anderswo die Ersatzschrift) - gemessen, mit etwas Luft.
 * Ohne Messmoeglichkeit grosszuegig geschaetzt: lieber Luft als zwei
 * Betraege, die ineinanderlaufen.
 */
export function textWidth(text: string, size: number, bold = false): number {
  if (measure === undefined) {
    try {
      measure = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    } catch {
      measure = null;
    }
  }
  if (measure) {
    measure.font = `${bold ? 700 : 400} ${size}px ${HAND}`;
    return measure.measureText(text).width * 1.05;
  }
  return text.length * size * 0.62 * (bold ? 1.07 : 1);
}

/** Gleicher Zufall bei jedem Zeichnen - die Linien zittern, aber immer gleich. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Eine Linie wie mit der Hand gezogen: leicht gebogen, Enden nicht ganz gerade. */
function handLine(x1: number, y1: number, x2: number, y2: number, seed: number): string {
  const next = random(seed);
  const jitter = (amount: number) => (next() - 0.5) * 2 * amount;
  const mx = (x1 + x2) / 2 + jitter(3);
  const my = (y1 + y2) / 2 + jitter(1.6);
  return `M${r1(x1 + jitter(1))} ${r1(y1 + jitter(1))} Q${r1(mx)} ${r1(my)} ${r1(x2 + jitter(1))} ${r1(y2 + jitter(1))}`;
}

/** Ein Kringel um die Ersparnis - etwas mehr als einmal herum, wie von Hand. */
function handEllipse(cx: number, cy: number, rx: number, ry: number, seed: number): string {
  const next = random(seed);
  const points: string[] = [];
  const start = -0.35;
  const turns = 1.08;
  const count = 54;
  for (let i = 0; i <= count; i++) {
    const angle = start + (i / count) * turns * Math.PI * 2;
    const wobble = 1 + (next() - 0.5) * 0.03 + (i / count) * 0.05;
    points.push(`${r1(cx + Math.cos(angle) * rx * wobble)} ${r1(cy + Math.sin(angle) * ry * wobble)}`);
  }
  return `M${points.join(" L")}`;
}

/** Name passt in die Spalte - laengere werden gekuerzt. */
function short(name: string, width: number): string {
  const clean = name.trim();
  if (textWidth(clean, 12) <= width) return clean;
  let cut = clean;
  while (cut.length > 5 && textWidth(`${cut}…`, 12) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function Stroke({ d, color = PEN, width = 1.6 }: { d: string; color?: string; width?: number }) {
  return (
    <path
      d={d}
      className="sketch-stroke"
      pathLength={1}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

interface RowLayout {
  y: number;
  /** Zeile mit Bonus: Jahreskosten, Bonus, Rest */
  withBonus: boolean;
  /** Grundlinie, auf der die Ersparnis des Jahres steht */
  resultY: number;
}

/** Spalten nach dem breitesten Eintrag - Schritte, die noch fehlen, halten ihren Platz schon frei. */
function columns(sketch: Sketch) {
  const widest = (entries: Array<[string | null, number, boolean?]>) =>
    Math.max(...entries.filter(([text]) => text).map(([text, size, bold]) => textWidth(text as string, size, bold)));
  const cellEntries = (pick: (year: Sketch["years"][number]) => SketchAmount): Array<[string | null, number, boolean?]> =>
    sketch.years.flatMap((year) => {
      const value = pick(year);
      return [[value.gross, 16], [value.bonus, 15], [value.net, 16, true]] as Array<[string | null, number, boolean?]>;
    });
  const label = widest([[`${sketch.years.length}. Jahr`, 16], ["Gesamt", 16, true], ["Bonus", 13]]);
  const now = widest([["Heute", 18, true], [sketch.currentTotal, 18, true], ...cellEntries((year) => year.current)]);
  const next = widest([["Neu", 18, true], [sketch.offerTotal, 18, true], ...cellEntries((year) => year.offer)]);
  const diff = widest([
    ["Ersparnis", 18, true],
    [`− ${sketch.savingText}`, 18, true],
    ...sketch.years.map((year) => [year.differenceText, 16, true] as [string, number, boolean]),
  ]);
  const xNow = X_LABEL + label + GAP + now;
  const xNew = xNow + GAP + next;
  const xDiff = xNew + GAP + diff;
  const savingWidth = textWidth(sketch.savingText, 32, true);
  const width = Math.ceil(
    Math.max(
      MIN_W,
      xDiff + X_LABEL,
      textWidth(sketch.title, 24, true) + 2 * X_LABEL,
      textWidth(`Abschlag im Monat: ${sketch.monthly}`, 16) + 2 * X_LABEL,
      savingWidth + 120,
    ),
  );
  // Breiteres Papier: die Spalten ruecken nach rechts, Luft bleibt zwischen ihnen.
  const shift = width - X_LABEL - xDiff;
  return {
    width,
    xNow: xNow + shift / 3,
    xNew: xNew + (shift * 2) / 3,
    xDiff: xDiff + shift,
    // Namen unter "Heute"/"Neu" duerfen nach links laufen - in der Kopfzeile steht dort nichts.
    nowWidth: xNow + shift / 3 - X_LABEL,
    newWidth: next + GAP + shift / 3 - 6,
    rx: Math.max(118, savingWidth / 2 + 34),
  };
}

function layout(sketch: Sketch) {
  let y = 170;
  const rows: RowLayout[] = sketch.years.map((year) => {
    const withBonus = Boolean(year.current.bonus || year.offer.bonus);
    const row = { y, withBonus, resultY: withBonus ? y + 50 : y };
    y += withBonus ? 82 : 36;
    return row;
  });
  const lineY = y - 16;
  const totalY = lineY + 34;
  const circleY = totalY + 78;
  const monthlyY = circleY + 84;
  const noteY = monthlyY + 30;
  return { rows, lineY, totalY, circleY, monthlyY, noteY, height: noteY + 24, ...columns(sketch) };
}

/**
 * Die Skizze als SVG. `step` bestimmt, wie weit sie aufgebaut ist; was gerade
 * dazukommt, wird geschrieben (Linien ziehen sich, Schrift blendet ein).
 */
export const PaperSketch = forwardRef<SVGSVGElement, { sketch: Sketch; step: number; animate?: boolean }>(function PaperSketch(
  { sketch, step, animate = true },
  ref,
) {
  const { rows, lineY, totalY, circleY, monthlyY, noteY, height, width: W, xNow: X_NOW, xNew: X_NEW, xDiff: X_DIFF, nowWidth, newWidth, rx } =
    layout(sketch);
  const saves = sketch.saving >= 0;
  /** Gruppe eines Schritts - nur die gerade neue wird geschrieben. */
  const group = (n: number, children: ReactNode) =>
    step >= n ? (
      <g key={n} className={animate && step === n ? "sketch-in" : undefined}>
        {children}
      </g>
    ) : null;

  const cell = (x: number, value: SketchAmount, row: RowLayout, seed: number, bold = false) => (
    <>
      <text x={x} y={row.y} textAnchor="end" fontSize={16}>
        {value.gross}
      </text>
      {value.bonus && (
        <>
          <text x={x} y={row.y + 24} textAnchor="end" fontSize={15} fill={RED}>
            {value.bonus}
          </text>
          <Stroke d={handLine(x - textWidth(value.gross, 16) * 0.95, row.y + 31, x + 2, row.y + 31, seed)} width={1.3} />
        </>
      )}
      {value.net && (
        <text x={x} y={row.y + 50} textAnchor="end" fontSize={16} fontWeight={bold ? 700 : 400}>
          {value.net}
        </text>
      )}
    </>
  );

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      role="img"
      aria-label={`${sketch.title}: ${sketch.currentName} ${sketch.currentTotal}, ${sketch.offerName} ${sketch.offerTotal}. ${sketch.savingLabel} ${sketch.savingText}.`}
      fontFamily={HAND}
      fill={PEN}
      style={{ display: "block" }}
    >
      <defs>
        <pattern id="sketch-grid" width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M18 0H0V18" fill="none" stroke={GRID} strokeWidth="0.8" />
        </pattern>
      </defs>
      <rect width={W} height={height} fill={PAPER} />
      <rect width={W} height={height} fill="url(#sketch-grid)" />

      {group(
        1,
        <>
          <text x={X_LABEL} y={44} fontSize={24} fontWeight={700}>
            {sketch.title}
          </text>
          <text x={X_LABEL} y={70} fontSize={15} opacity={0.75}>
            {sketch.subtitle}
          </text>
          <text x={X_NOW} y={112} textAnchor="end" fontSize={18} fontWeight={700}>
            Heute
          </text>
          <text x={X_NOW} y={130} textAnchor="end" fontSize={12} opacity={0.75}>
            {short(sketch.currentName, nowWidth)}
          </text>
          <Stroke d={handLine(X_LABEL - 2, 142, X_DIFF + 4, 142, 11)} />
          {sketch.years.map((year, index) => (
            <g key={year.label}>
              <text x={X_LABEL} y={rows[index].y} fontSize={16}>
                {year.label}
              </text>
              {cell(X_NOW, year.current, rows[index], 100 + index)}
            </g>
          ))}
          <Stroke d={handLine(X_LABEL - 2, lineY, X_DIFF + 4, lineY, 21)} />
          <Stroke d={handLine(X_LABEL - 2, lineY + 4, X_DIFF + 4, lineY + 4, 22)} />
          <text x={X_LABEL} y={totalY} fontSize={16} fontWeight={700}>
            Gesamt
          </text>
          <text x={X_NOW} y={totalY} textAnchor="end" fontSize={18} fontWeight={700}>
            {sketch.currentTotal}
          </text>
        </>,
      )}

      {group(
        2,
        <>
          <text x={X_NEW} y={112} textAnchor="end" fontSize={18} fontWeight={700}>
            Neu
          </text>
          <text x={X_NEW} y={130} textAnchor="end" fontSize={12} opacity={0.75}>
            {short(sketch.offerName, newWidth)}
          </text>
          {sketch.years.map((year, index) => (
            <g key={year.label}>
              {rows[index].withBonus && (
                <text x={X_LABEL} y={rows[index].y + 24} fontSize={13} fill={RED}>
                  Bonus
                </text>
              )}
              {cell(X_NEW, year.offer, rows[index], 200 + index, true)}
            </g>
          ))}
          <text x={X_NEW} y={totalY} textAnchor="end" fontSize={18} fontWeight={700}>
            {sketch.offerTotal}
          </text>
        </>,
      )}

      {group(
        3,
        <>
          <text x={X_DIFF} y={112} textAnchor="end" fontSize={18} fontWeight={700}>
            Ersparnis
          </text>
          {sketch.years.map((year, index) => (
            <text
              key={year.label}
              x={X_DIFF}
              y={rows[index].resultY}
              textAnchor="end"
              fontSize={16}
              fontWeight={700}
              fill={year.difference >= 0 ? GREEN : RED}
            >
              {year.differenceText}
            </text>
          ))}
          <text x={X_DIFF} y={totalY} textAnchor="end" fontSize={18} fontWeight={700} fill={saves ? GREEN : RED}>
            {saves ? sketch.savingText : `− ${sketch.savingText}`}
          </text>
          {/* Der alte Preis wird durchgestrichen - nur, wenn neu wirklich guenstiger ist. */}
          {saves && <Stroke d={handLine(X_NOW - textWidth(sketch.currentTotal, 18, true) * 0.9, totalY - 5, X_NOW + 4, totalY - 9, 31)} color={RED} width={2.2} />}
          <text x={W / 2} y={circleY - 12} textAnchor="middle" fontSize={18} fill={saves ? GREEN : RED}>
            {sketch.savingLabel}
          </text>
          <text x={W / 2} y={circleY + 24} textAnchor="middle" fontSize={32} fontWeight={700} fill={saves ? GREEN : RED}>
            {sketch.savingText}
          </text>
          <Stroke d={handEllipse(W / 2, circleY + 4, rx, 46, 41)} color={saves ? GREEN : RED} width={2.4} />
        </>,
      )}

      {group(
        4,
        <>
          <text x={W / 2} y={monthlyY} textAnchor="middle" fontSize={16}>
            Abschlag im Monat: <tspan fontWeight={700}>{sketch.monthly}</tspan>
          </text>
          <text x={W / 2} y={noteY} textAnchor="middle" fontSize={11} opacity={0.65}>
            {sketch.note}
          </text>
        </>,
      )}
    </svg>
  );
});
