import type { ReactElement } from "react";
import type { Example, ModuleIcon, Rule, RuleBasis } from "@/lib/academy/content";
import { IconBan, IconChat, IconCheck, IconInfo, IconKey, IconPencil, IconPerson, IconShield, IconX } from "@/components/icons";
import { Pill } from "@/components/ui";

/*
 * Bausteine der Akademie ohne Zustand - laufen auf dem Server. Das Quiz
 * selbst steht in Quiz.tsx.
 */

type IconComponent = (props: { className?: string }) => ReactElement;

const MODULE_ICONS: Record<ModuleIcon, IconComponent> = {
  person: IconPerson,
  chat: IconChat,
  ban: IconBan,
  pencil: IconPencil,
  key: IconKey,
  shield: IconShield,
};

/** Zeichen eines Moduls - auf einer ToneTile im Ton des Moduls. */
export function ModuleGlyph({ icon, className = "h-4 w-4" }: { icon: ModuleIcon; className?: string }) {
  const Icon = MODULE_ICONS[icon];
  return <Icon className={className} />;
}

/** Woher eine Regel kommt: "Gesetz · § 123 StGB" oder "Hausregel". Farbe nur als Zusatz zum Wort. */
export function BasisTag({ basis, reference }: { basis: RuleBasis; reference?: string }) {
  return <Pill>{basis === "law" ? `Gesetz${reference ? ` · ${reference}` : ""}` : "Hausregel"}</Pill>;
}

const MARKS: Record<Rule["kind"], { Icon: IconComponent; className: string; label: string }> = {
  do: { Icon: IconCheck, className: "bg-accent-tint text-accent-ink", label: "So machen wir es:" },
  dont: { Icon: IconX, className: "bg-danger-tint text-danger", label: "Niemals:" },
  info: { Icon: IconInfo, className: "bg-fill text-muted", label: "Gut zu wissen:" },
};

/** Regeln einer Lektion: Haken = so machen wir es, Kreuz = niemals, i = gut zu wissen. */
export function RuleList({ rules }: { rules: Rule[] }) {
  return (
    <ul className="space-y-3.5">
      {rules.map((rule, index) => {
        const { Icon, className, label } = MARKS[rule.kind];
        return (
          <li key={index} className="flex gap-3">
            <span
              className={`mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full ${className}`}
              aria-hidden="true"
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body">
                <span className="sr-only">{label} </span>
                {rule.text}
              </p>
              {rule.basis && (
                <p className="mt-1.5">
                  <BasisTag basis={rule.basis} reference={rule.ref} />
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Das Wichtigste eines Moduls - drei Saetze mit Haken. */
export function KeyPoints({ points }: { points: string[] }) {
  return (
    <ul className="space-y-3">
      {points.map((point) => (
        <li key={point} className="flex gap-3">
          <span
            className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-tint text-accent-ink"
            aria-hidden="true"
          >
            <IconCheck className="h-3.5 w-3.5" />
          </span>
          <p className="min-w-0 flex-1 text-body">{point}</p>
        </li>
      ))}
    </ul>
  );
}

/** Ein Satz an der Tuer: die Lage, so nicht, so geht's. */
export function ExampleBox({ example }: { example: Example }) {
  return (
    <figure className="mt-5 rounded-xl bg-fill p-3">
      <figcaption className="px-1 text-subhead text-ink-2">
        <span className="font-semibold text-ink">Beispiel: </span>
        {example.situation}
      </figcaption>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-surface p-3">
          <p className="flex items-center gap-1.5 text-footnote font-semibold text-danger">
            <IconX className="h-3.5 w-3.5" />
            So nicht
          </p>
          <p className="mt-1 text-body">{example.wrong}</p>
        </div>
        <div className="rounded-lg bg-surface p-3">
          <p className="flex items-center gap-1.5 text-footnote font-semibold text-accent-ink">
            <IconCheck className="h-3.5 w-3.5" />
            So geht’s
          </p>
          <p className="mt-1 text-body">{example.right}</p>
        </div>
      </div>
    </figure>
  );
}
