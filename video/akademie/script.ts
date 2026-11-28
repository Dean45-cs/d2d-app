import { createHash } from "node:crypto";
import {
  ACADEMY_MODULES,
  PASS_PERCENT,
  RED_LINES,
  type AcademyModule,
  type ModuleIcon,
  type ModuleTone,
  type Rule,
} from "../../src/lib/academy/content";
import { RED_LINES_VIDEO } from "../../src/lib/academy/videos";
import { sentences, speakable } from "./speech";

/**
 * Drehbuch der Akademie-Videos - entsteht aus src/lib/academy/content.ts,
 * damit Video, Text und Quiz dasselbe sagen.
 *
 * Ein Video ist eine Folge von Szenen; jede Szene hat ein Bild (visual) und
 * einen oder mehrere Takte (beats). Ein Takt ist ein gesprochener Absatz;
 * mit ihm erscheint der naechste Teil des Bildes (etwa „So nicht“, dann
 * „So geht's“). Der Text eines Takts ist zugleich der Untertitel.
 *
 * Aendert sich hier oder in den Inhalten etwas, aendert sich scriptHash -
 * dann muessen die Videos neu gerendert werden (npm test meldet es).
 */

/** Hochzaehlen, wenn sich das Aussehen der Videos aendert (stage.*), damit neu gerendert wird. */
export const RENDER_VERSION = 1;

/** Stimme: Piper mit "Thorsten" (CC0), etwas langsamer als gewohnt - zum Mitschreiben im Kopf. */
export const VOICE = { model: "de_DE-thorsten-high", lengthScale: 1.08 };

export type RuleKind = Rule["kind"];

export type Visual =
  | {
      kind: "title";
      eyebrow: string;
      title: string;
      text: string;
      icon: ModuleIcon | "graduation" | "x";
      tone: ModuleTone | "green" | "red";
      chips: string[];
    }
  | { kind: "lesson"; eyebrow: string; title: string; text: string; number: number }
  | { kind: "rule"; eyebrow: string; rule: RuleKind; text: string; tag: string | null }
  | { kind: "example"; situation: string; wrong: string; right: string }
  | { kind: "points"; eyebrow: string; title: string; points: string[] }
  | { kind: "redline"; number: number; total: number; text: string; tag: string | null }
  | { kind: "outro"; eyebrow: string; title: string; text: string; icon: "graduation" | "x"; chips: string[] };

export interface Scene {
  visual: Visual;
  /** Gesprochene Absaetze; der erste beginnt mit der Szene. */
  beats: string[];
  /** Kapitelmarke in der App - nur an den Anfaengen der Abschnitte. */
  chapter?: string;
}

export interface VideoScript {
  id: string;
  title: string;
  /** Marke oben links: Nummer und Name des Moduls. */
  chip: { badge: string; label: string; tone: "green" | "red" };
  /** Hintergrundlicht: gruen fuer die Module, rot fuer die roten Linien. */
  mood: "green" | "red";
  scenes: Scene[];
}

/** Woher eine Regel kommt, kurz fuers Bild: "Gesetz · § 123 StGB" oder "Hausregel". */
export function tagFor(basis: Rule["basis"], ref?: string): string | null {
  if (basis === "law") return ref ? `Gesetz · ${ref}` : "Gesetz";
  if (basis === "house") return "Hausregel";
  return null;
}

/** Abwechselnd gesagt, wenn eine Regel aus dem Gesetz kommt. */
const LAW_PHRASES = ["Das ist Gesetz.", "Das schreibt das Gesetz vor.", "Das ist gesetzlich so geregelt."];

const ORDINALS = ["Erstens", "Zweitens", "Drittens", "Viertens", "Fünftens", "Sechstens", "Siebtens", "Achtens", "Neuntens", "Zehntens", "Elftens", "Zwölftens"];

function moduleVideo(mod: AcademyModule, index: number): VideoScript {
  let lawCount = 0;
  const lawPhrase = () => LAW_PHRASES[lawCount++ % LAW_PHRASES.length];
  const number = String(index + 1).padStart(2, "0");
  const scenes: Scene[] = [
    {
      chapter: "Einstieg",
      visual: {
        kind: "title",
        eyebrow: `Modul ${index + 1} von ${ACADEMY_MODULES.length}`,
        title: mod.title,
        text: mod.summary,
        icon: mod.icon,
        tone: mod.tone,
        chips: [`${mod.lessons.length} Lektionen`, `${mod.quiz.length} Fragen`, `ab ${PASS_PERCENT} % bestanden`],
      },
      beats: [`Modul ${index + 1}: ${mod.title}.`, mod.summary],
    },
  ];

  mod.lessons.forEach((lesson, l) => {
    scenes.push({
      chapter: lesson.title,
      visual: {
        kind: "lesson",
        eyebrow: `Lektion ${l + 1} von ${mod.lessons.length}`,
        title: lesson.title,
        text: lesson.text,
        number: l + 1,
      },
      beats: [`Lektion ${l + 1}: ${lesson.title}.`, lesson.text],
    });
    lesson.rules.forEach((rule, r) => {
      const fromLaw = rule.basis === "law";
      scenes.push({
        visual: {
          kind: "rule",
          eyebrow: `Lektion ${l + 1} · Punkt ${r + 1} von ${lesson.rules.length}`,
          rule: rule.kind,
          text: rule.text,
          tag: tagFor(rule.basis, rule.ref),
        },
        beats: [fromLaw ? `${rule.text} ${lawPhrase()}` : rule.text],
      });
    });
    if (lesson.example) {
      scenes.push({
        visual: { kind: "example", ...lesson.example },
        beats: [`Ein Beispiel. ${lesson.example.situation}`, `So nicht: ${lesson.example.wrong}`, `So geht’s: ${lesson.example.right}`],
      });
    }
  });

  scenes.push({
    chapter: "Das Wichtigste",
    visual: { kind: "points", eyebrow: "Das Wichtigste", title: "In Kürze", points: mod.keyPoints },
    beats: ["Das Wichtigste in Kürze.", ...mod.keyPoints],
  });
  scenes.push({
    visual: {
      kind: "outro",
      eyebrow: "Jetzt bist du dran",
      title: "Mach das Quiz",
      text: `Direkt unter dem Video: ${mod.quiz.length} Fragen, bestanden ab ${PASS_PERCENT} %.`,
      icon: "graduation",
      chips: ["Wiederholen geht jederzeit"],
    },
    beats: [
      "Jetzt bist du dran: Direkt unter dem Video wartet das Quiz.",
      `${mod.quiz.length} Fragen – ab ${PASS_PERCENT} % hast du bestanden. Viel Erfolg!`,
    ],
  });

  return {
    id: mod.id,
    title: mod.title,
    chip: { badge: number, label: mod.title, tone: "green" },
    mood: "green",
    scenes,
  };
}

function redLinesVideo(): VideoScript {
  const total = RED_LINES.length;
  const fromLaw = RED_LINES.filter((line) => line.basis === "law").length;
  const house = total - fromLaw;
  const scenes: Scene[] = [
    {
      chapter: "Einstieg",
      visual: {
        kind: "title",
        eyebrow: "Carlsson Sales Akademie",
        title: `Die ${total} roten Linien`,
        text: "Sie gelten immer – an jeder Tür, bei jedem Kunden.",
        icon: "x",
        tone: "red",
        chips: [`${fromLaw} aus dem Gesetz`, `${house} Hausregel${house === 1 ? "" : "n"}`],
      },
      beats: [
        `Die ${total} roten Linien.`,
        `Sie gelten immer – an jeder Tür, bei jedem Kunden. ${fromLaw} davon stehen so im Gesetz, ${house === 1 ? "eine ist unsere Hausregel" : `${house} sind unsere Hausregeln`}.`,
      ],
    },
    ...RED_LINES.map(
      (line, index): Scene => ({
        chapter: index === 0 ? "Die Linien" : undefined,
        visual: { kind: "redline", number: index + 1, total, text: line.text, tag: tagFor(line.basis, line.ref) },
        beats: [`${ORDINALS[index] ?? `Nummer ${index + 1}`}: ${line.text}`],
      }),
    ),
    {
      visual: {
        kind: "outro",
        eyebrow: "Gilt immer",
        title: "Keine Ausnahmen",
        text: "Wie du die Linien im Alltag sicher einhältst, zeigen dir die sechs Module der Akademie.",
        icon: "x",
        chips: ["Bei Fragen: deine Leitung"],
      },
      beats: [
        "Das sind die roten Linien – ohne Ausnahme.",
        `Wie du sie im Alltag sicher einhältst, zeigen dir die ${ACADEMY_MODULES.length} Module der Akademie.`,
      ],
    },
  ];
  return {
    id: RED_LINES_VIDEO,
    title: "Die roten Linien",
    chip: { badge: "!", label: "Rote Linien", tone: "red" },
    mood: "red",
    scenes,
  };
}

/** Alle Videos: die roten Linien, dann die Module in ihrer Reihenfolge. */
export function buildVideoScripts(): VideoScript[] {
  return [redLinesVideo(), ...ACADEMY_MODULES.map(moduleVideo)];
}

/**
 * Fingerabdruck eines Drehbuchs - steht im Manifest; weicht er ab, ist das
 * Video veraltet. Er umfasst auch, wie gesprochen wird (Aussprache in
 * speech.ts, Stimme); fuers Aussehen zaehlt RENDER_VERSION.
 */
export function scriptHash(script: VideoScript): string {
  const speech = script.scenes.map((scene) => scene.beats.map((beat) => sentences(beat).map(speakable)));
  return createHash("sha256")
    .update(JSON.stringify({ render: RENDER_VERSION, voice: VOICE, script, speech }))
    .digest("hex")
    .slice(0, 16);
}
