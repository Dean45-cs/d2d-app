"use client";

import { useState } from "react";
import { IconChevronDown } from "./icons";
import { SectionHeader, SkeletonText } from "./ui";
import {
  MAX_CHANGE,
  PROFILE_AXES,
  profilePoints,
  type ProfileAxisKey,
  type ProfileCounts,
  type ProfilePoint,
} from "@/lib/profile";

export interface ProfileSubject {
  /** 0 = das ganze Team. */
  id: number;
  name: string;
  now: ProfileCounts;
  /** null: kein Zeitraum davor ("Gesamt"). */
  before: ProfileCounts | null;
}

/* Masse im SVG: die Beschriftung braucht rundherum Platz, das Netz bleibt kompakt. */
const WIDTH = 320;
const HEIGHT = 224;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const RADIUS = 72;
const LABEL = RADIUS + 10;
const RINGS = [0.25, 0.5, 0.75, 1];
const STEP = 360 / PROFILE_AXES.length;

/**
 * Profil als Netzdiagramm: sechs Achsen, jede am eigenen Zeitraum davor
 * gemessen. Der gestrichelte Ring ist "wie vorher", der Aussenrand "doppelt
 * so viel" - was hinausragt, ist besser geworden. Die Teamleitung schaltet
 * zwischen Team und einzelnen Personen um; ein Tipp auf eine Achse zeigt,
 * woraus der Wert besteht.
 */
export function ProfileRadar({
  subjects,
  currentLabel,
  previousLabel,
  className = "",
}: {
  subjects: ProfileSubject[];
  currentLabel: string;
  /** null: kein Vergleich moeglich ("Gesamt"). */
  previousLabel: string | null;
  className?: string;
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? 0);
  const [selected, setSelected] = useState<ProfileAxisKey | null>(null);
  const subject = subjects.find((s) => s.id === subjectId) ?? subjects[0];
  if (!subject) return null;

  const points = profilePoints(subject.now, previousLabel ? subject.before : null);
  const empty = subject.now.doors === 0 && subject.now.dueAppointments === 0;
  const compare = previousLabel !== null && !empty;
  const active = points.find((p) => p.axis.key === selected) ?? null;

  const picker =
    subjects.length > 1 ? (
      // Wie der Verweis einer Abschnittsueberschrift: 44-pt-Trefferflaeche per Polster, Zeile bleibt flach.
      <label className="link -mb-2 -mt-4 cursor-pointer pb-2 pt-4 text-subhead">
        <span className="sr-only">Profil von</span>
        <select
          className="max-w-40 cursor-pointer appearance-none text-ellipsis bg-transparent pr-5 [field-sizing:content]"
          value={subject.id}
          onChange={(event) => setSubjectId(Number(event.target.value))}
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <IconChevronDown className="pointer-events-none -ml-5 h-3.5 w-3.5" />
      </label>
    ) : undefined;

  return (
    <section className={className}>
      <SectionHeader title="Profil" action={picker} />
      <figure className="surface m-0 flex flex-1 flex-col p-4">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="mx-auto block w-full max-w-[360px] select-none"
          role="group"
          aria-label={
            compare ? `Profil ${currentLabel} im Vergleich zu ${previousLabel}` : `Profil ${currentLabel}`
          }
        >
          {RINGS.map((ring) => (
            <circle key={ring} cx={CX} cy={CY} r={RADIUS * ring} className="fill-none stroke-separator" />
          ))}
          {points.map((_, index) => {
            const [x, y] = at(index, RADIUS);
            return <line key={index} x1={CX} y1={CY} x2={x} y2={y} className="stroke-separator" />;
          })}

          {compare && (
            <>
              {/* Zeitraum davor: auf jeder Achse genau "wie vorher". */}
              <polygon
                points={outline(points.map(() => 1))}
                strokeDasharray="4 3"
                strokeWidth={1.5}
                style={{ fill: "var(--chart-doors-soft)", fillOpacity: 0.45, stroke: "var(--chart-doors)" }}
              />
              <polygon
                points={outline(points.map((p) => p.change ?? 1))}
                strokeWidth={2}
                strokeLinejoin="round"
                className="fill-accent/20 stroke-accent"
              />
            </>
          )}

          {points.map((point, index) => (
            <Axis
              key={point.axis.key}
              index={index}
              point={point}
              compare={compare}
              selected={point.axis.key === selected}
              onSelect={() => setSelected((key) => (key === point.axis.key ? null : point.axis.key))}
            />
          ))}
        </svg>

        <figcaption className="mt-3 min-h-11 text-footnote" aria-live="polite">
          {active ? (
            <Detail point={active} subject={subject} currentLabel={currentLabel} previousLabel={previousLabel} />
          ) : empty ? (
            <p className="text-center text-muted">{currentLabel}: noch nichts erfasst.</p>
          ) : !previousLabel ? (
            <p className="text-center text-muted">
              Bei „Gesamt“ gibt es keinen Zeitraum davor – Werte ohne Vergleich. Achse antippen für Details.
            </p>
          ) : (
            <>
              <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-ink-2">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                  {currentLabel}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-0 w-3 border-t-2 border-dashed"
                    style={{ borderColor: "var(--chart-doors)" }}
                    aria-hidden="true"
                  />
                  {previousLabel}
                </span>
              </p>
              <p className="mt-1 text-center text-muted">Außenrand = doppelt so viel wie davor</p>
            </>
          )}
        </figcaption>
      </figure>
    </section>
  );
}

/** Platzhalter in derselben Form: leeres Netz, darunter die Legende - beim Laden springt nichts. */
export function SkeletonProfile() {
  return (
    <div className="surface flex flex-1 flex-col p-4" aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mx-auto block w-full max-w-[360px]">
        {RINGS.map((ring) => (
          <circle key={ring} cx={CX} cy={CY} r={RADIUS * ring} className="fill-none stroke-separator" />
        ))}
        {PROFILE_AXES.map((axis, index) => {
          const [x, y] = at(index, RADIUS);
          return <line key={axis.key} x1={CX} y1={CY} x2={x} y2={y} className="stroke-separator" />;
        })}
      </svg>
      <div className="mt-3 flex min-h-11 flex-col items-center gap-2">
        <SkeletonText width="60%" />
        <SkeletonText width="45%" />
      </div>
    </div>
  );
}

/** Eine Achse: Beschriftung mit Wert und Punkt - beides antippbar. */
function Axis({
  index,
  point,
  compare,
  selected,
  onSelect,
}: {
  index: number;
  point: ProfilePoint;
  compare: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const [lx, ly] = at(index, LABEL);
  const [dx, dy] = at(index, RADIUS * ((point.change ?? 1) / MAX_CHANGE));
  const { anchor, nameY, valueY } = placement(index, ly);
  const value = point.now === null ? "–" : point.axis.format(point.now);
  // Trefferflaeche um die Beschriftung - auf dem Handy mindestens daumenbreit.
  const boxX = anchor === "middle" ? lx - 40 : anchor === "start" ? lx - 6 : lx - 74;

  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${point.axis.label}: ${value}`}
      // Rahmen nur fuer die Tastatur - nach dem Tippen markiert die Auswahl selbst.
      className="cursor-pointer [&:focus:not(:focus-visible)]:outline-none"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <rect x={boxX} y={nameY - 14} width={80} height={valueY - nameY + 20} className="fill-transparent" />
      <text
        x={lx}
        y={nameY}
        textAnchor={anchor}
        style={{ fontSize: 12 }}
        className={selected ? "fill-accent-ink font-semibold" : "fill-muted"}
      >
        {point.axis.label}
      </text>
      <text
        x={lx}
        y={valueY}
        textAnchor={anchor}
        style={{ fontSize: 13 }}
        className={`font-semibold ${point.now === null ? "fill-muted" : "fill-ink-2"}`}
      >
        {value}
      </text>
      {compare && (
        <>
          <circle cx={dx} cy={dy} r={14} className="fill-transparent" />
          {/* Ohne Vergleich bleibt der Punkt hohl auf "wie vorher" - keine Aussage. */}
          <circle
            cx={dx}
            cy={dy}
            r={selected ? 5.5 : 4}
            strokeWidth={2}
            className={point.change === null ? "fill-surface stroke-muted" : "fill-accent stroke-surface"}
          />
        </>
      )}
    </g>
  );
}

/** Woraus der Wert der gewaehlten Achse besteht - jetzt und davor. */
function Detail({
  point,
  subject,
  currentLabel,
  previousLabel,
}: {
  point: ProfilePoint;
  subject: ProfileSubject;
  currentLabel: string;
  previousLabel: string | null;
}) {
  const line = (value: number | null, source: ProfileCounts) =>
    `${value === null ? "zu wenig Daten" : point.axis.format(value)} · ${point.axis.basis(source)}`;
  return (
    <>
      <p className="text-center text-ink-2">
        <span className="font-semibold text-ink">{point.axis.label}</span> · {line(point.now, subject.now)}
        <span className="sr-only"> ({currentLabel})</span>
      </p>
      {previousLabel && subject.before && (
        <p className="mt-1 text-center text-muted">
          {previousLabel}: {line(point.before, subject.before)}
        </p>
      )}
    </>
  );
}

/** Punkt auf Achse `index` im Abstand `distance` - Achse 0 zeigt nach oben. */
function at(index: number, distance: number): [number, number] {
  const angle = ((index * STEP - 90) * Math.PI) / 180;
  return [CX + Math.cos(angle) * distance, CY + Math.sin(angle) * distance];
}

function outline(changes: number[]): string {
  return changes
    .map((change, index) => at(index, RADIUS * (Math.max(0, change) / MAX_CHANGE)).map((n) => n.toFixed(1)).join(","))
    .join(" ");
}

/** Oben und unten mittig, seitlich vom Netz weg - zwei Zeilen: Name, Wert. */
function placement(index: number, y: number): { anchor: "start" | "middle" | "end"; nameY: number; valueY: number } {
  const angle = ((index * STEP - 90) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const anchor = Math.abs(cos) < 0.1 ? "middle" : cos > 0 ? "start" : "end";
  if (sin < -0.9) return { anchor, nameY: y - 14, valueY: y };
  if (sin > 0.9) return { anchor, nameY: y + 10, valueY: y + 24 };
  return { anchor, nameY: y - 4, valueY: y + 10 };
}
