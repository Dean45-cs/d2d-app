"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { Avatar, Cell, ListLabel, Notice, plural } from "@/components/ui";
import { IconCheck, IconPyramid } from "@/components/icons";
import { PromoteSheet } from "@/components/ranks/PromoteSheet";
import { monthYear } from "@/lib/format";
import type { CareerSummary } from "@/lib/ranks-model";
import { tierIndex } from "@/lib/tiers";
import type { Tier } from "@/lib/types";

export interface LadderPerson {
  id: number;
  name: string;
  first: string;
  avatar: string;
  me: boolean;
  /** Alle Ziele fuer den naechsten Rang erreicht - nur, wenn man ihren Fortschritt sehen darf. */
  ready: boolean;
  reports: number;
  managerName: string | null;
}

export interface LadderRung {
  tier: Tier;
  label: string;
  team: boolean;
  /** Ziele fuer den Aufstieg in diesen Rang, fertig beschriftet. */
  goals: string[];
  people: LadderPerson[];
}

type RungState = "done" | "now" | "next" | "open";

/**
 * Die Leiter von oben nach unten. Die eigene Sprosse traegt "Du", die naechste
 * die Ziele mit Balken; darueber nur, was der Rang bringt - ohne Betraege.
 */
export function CareerLadder({
  rungs,
  career,
  since,
  ready,
  canPromote,
}: {
  rungs: LadderRung[];
  career: CareerSummary | null;
  since: string | null;
  ready: Array<LadderPerson & { tier: Tier }>;
  canPromote: boolean;
}) {
  const [promote, setPromote] = useState<(LadderPerson & { tier: Tier }) | null>(null);
  const mine = career ? tierIndex(career.tier) : null;

  const stateOf = (tier: Tier): RungState => {
    if (mine === null) return "open";
    const index = tierIndex(tier);
    if (index < mine) return "done";
    if (index === mine) return "now";
    if (index === mine + 1) return "next";
    return "open";
  };

  return (
    <div className="mx-auto max-w-[720px] space-y-6">
      {ready.length > 0 && (
        <section>
          <ListLabel>Bereit für den Aufstieg</ListLabel>
          <ul className="list list-icons">
            {ready.map((person) => {
              const target = rungs.find((rung) => tierIndex(rung.tier) === tierIndex(person.tier) + 1);
              return (
                <li key={person.id}>
                  <Cell
                    onClick={canPromote ? () => setPromote(person) : undefined}
                    href={canPromote ? undefined : `/profil/${person.id}`}
                    icon={<Avatar name={person.name} src={person.avatar} size={32} />}
                    title={person.name}
                    subtitle={`Alle Ziele für ${target?.label ?? "den nächsten Rang"} erreicht`}
                    detail={canPromote ? "Befördern" : undefined}
                    chevron
                  />
                </li>
              );
            })}
          </ul>
          {!canPromote && <p className="list-footer">Befördert wird von der Geschäftsführung.</p>}
        </section>
      )}

      {career?.ready && (
        <Notice icon={<IconCheck className="h-5 w-5" />}>
          <strong>Alle Ziele für {career.nextLabel} erreicht.</strong> Die Geschäftsführung prüft deinen Aufstieg.
        </Notice>
      )}

      <ol className="ladder" aria-label="Karriereleiter, von oben nach unten">
        {rungs.map((rung, index) => {
          const state = stateOf(rung.tier);
          return (
            <li key={rung.tier} className="ladder-rung" data-state={state} style={{ "--rung": index } as CSSProperties}>
              <span className="ladder-mark" aria-hidden="true">
                {state === "done" && <IconCheck className="h-3.5 w-3.5" />}
              </span>
              <div className="ladder-body surface">
                <div className="flex items-baseline gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-headline">{rung.label}</h2>
                  {state === "now" && <span className="ladder-tag ladder-tag-now">Du</span>}
                  {state === "next" && <span className="ladder-tag">Nächster Rang</span>}
                  {rung.people.length > 0 && (
                    <span className="shrink-0 text-footnote text-muted">
                      {rung.people.length}
                      <span className="sr-only"> {rung.people.length === 1 ? "Person" : "Personen"}</span>
                    </span>
                  )}
                </div>

                {state === "now" && since && <p className="text-footnote text-muted">Seit {monthYear(since)}</p>}
                {(state === "open" || state === "next") && mine !== null && (
                  <p className="text-footnote text-muted">
                    {rung.team && !rungs.find((other) => career && other.tier === career.tier)?.team ? "Mehr Provision · eigenes Team" : "Mehr Provision"}
                  </p>
                )}
                {mine === null && rung.team && <p className="text-footnote text-muted">Mit eigenem Team</p>}

                {state === "next" && career ? (
                  career.goals.length > 0 ? (
                    <ul className="ladder-goals">
                      {career.goals.map((goal) => (
                        <li key={goal.id} className="ladder-goal" data-met={goal.met ? "true" : undefined}>
                          <span className="flex items-baseline gap-2">
                            <span className="min-w-0 flex-1 truncate text-subhead">
                              {goal.title}
                              {goal.period && <span className="text-muted"> · {goal.period}</span>}
                            </span>
                            <span className="kpi shrink-0 text-subhead text-muted">
                              {goal.met ? <IconCheck className="inline h-4 w-4 text-accent-ink" aria-label="erreicht" /> : goal.value}
                            </span>
                          </span>
                          <span className="ladder-goal-bar" aria-hidden="true">
                            <span style={{ width: `${Math.round(goal.ratio * 100)}%` }} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-footnote text-muted">Die Ziele legt die Geschäftsführung noch fest.</p>
                  )
                ) : (
                  (state === "open" || mine === null) &&
                  rung.goals.length > 0 && <p className="mt-1 text-footnote text-muted">Ziele: {rung.goals.join(" · ")}</p>
                )}

                {rung.people.length === 0 ? (
                  <p className="mt-2 text-footnote text-muted">Noch frei</p>
                ) : (
                  <ul className="ladder-people">
                    {rung.people.map((person) => (
                      <li key={person.id}>
                        <Link
                          href={`/profil/${person.id}`}
                          className="ladder-person"
                          title={person.name}
                          aria-label={[person.me ? `${person.name} (du)` : person.name, person.ready ? "bereit für den Aufstieg" : null]
                            .filter(Boolean)
                            .join(", ")}
                          aria-current={person.me ? "true" : undefined}
                        >
                          <span className="relative">
                            <Avatar name={person.name} src={person.avatar} size={40} className={person.me ? "ladder-me" : ""} />
                            {person.ready && <span className="ladder-ready" aria-hidden="true" />}
                          </span>
                          <span className={`block w-full truncate text-caption ${person.me ? "font-semibold text-accent-ink" : "text-muted"}`}>
                            {person.me ? "Du" : person.first}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="list-footer text-center">
        {mine === null
          ? "Wer alle Ziele seines nächsten Rangs erreicht, ist bereit. Befördert wird von Hand."
          : "Erreichst du alle Ziele, bekommt deine Führungskraft Bescheid. Befördert wird von der Geschäftsführung."}
      </p>

      {canPromote && (
        <ul className="list list-icons">
          <li>
            <Cell
              href="/einstellungen/raenge"
              icon={<IconPyramid className="h-5 w-5 text-muted" />}
              title="Ränge und Ziele einstellen"
              subtitle={plural(rungs.reduce((sum, rung) => sum + rung.goals.length, 0), "Ziel", "Ziele")}
            />
          </li>
        </ul>
      )}

      {promote && (
        <PromoteSheet
          person={{ id: promote.id, name: promote.name, tier: promote.tier }}
          reports={promote.reports}
          managerName={promote.managerName}
          ready
          onClose={() => setPromote(null)}
        />
      )}
    </div>
  );
}
