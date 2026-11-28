import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { ACADEMY_MODULES, PASS_PERCENT, RED_LINES } from "@/lib/academy/content";
import { passedCount, progressFor } from "@/lib/academy/store";
import { ModuleGlyph, RuleList } from "@/components/academy/parts";
import { Cell, ListLabel, PageHeader, Pill, ProgressRing, ToneTile } from "@/components/ui";
import { IconCheck, IconUsers } from "@/components/icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Akademie" };

/**
 * Die Akademie: Verhaltensstandards an der Haustuer in sechs Modulen, je mit
 * Quiz - dazu die roten Linien, die immer gelten. Wer die Teamauswertung
 * sehen darf, sieht oben rechts den Stand des Teams.
 */
export default async function AcademyPage() {
  const user = await requireUser();
  const rights = permissionsFor(user);
  const progress = progressFor(user.id);
  const passed = passedCount(progress);
  const total = ACADEMY_MODULES.length;
  const nextUp = ACADEMY_MODULES.find((_, index) => !progress[index].passed);

  return (
    <div className="page-narrow">
      <PageHeader
        title="Akademie"
        subtitle={`${passed} von ${total} Modulen bestanden`}
        back={{ href: "/profil", label: "Profil", mobileOnly: true }}
        actions={
          rights["reports.team"] ? (
            <Link href="/akademie/team" className="icon-btn" aria-label="Stand des Teams">
              <IconUsers className="h-5 w-5" />
            </Link>
          ) : undefined
        }
      />

      <div className="surface flex items-center gap-4 p-4">
        <ProgressRing value={passed} max={total} size={56} label={`${passed} von ${total} Modulen bestanden`}>
          {passed}/{total}
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="text-headline">
            {!nextUp ? "Alle Module bestanden" : passed === 0 ? "Los geht’s mit dem ersten Modul" : `Weiter mit: ${nextUp.title}`}
          </p>
          <p className="text-footnote text-muted">
            {nextUp ? `Bestanden ab ${PASS_PERCENT} % richtiger Antworten` : "Wiederholen kannst du jederzeit"}
          </p>
        </div>
        {nextUp && (
          <Link href={`/akademie/${nextUp.id}`} className="btn btn-primary btn-sm">
            {passed === 0 ? "Starten" : "Weiter"}
          </Link>
        )}
      </div>

      <ListLabel>Module</ListLabel>
      <ul className="list list-icons">
        {ACADEMY_MODULES.map((mod, index) => {
          const own = progress[index];
          return (
            <li key={mod.id}>
              <Cell
                href={`/akademie/${mod.id}`}
                icon={
                  <ToneTile tone={mod.tone}>
                    <ModuleGlyph icon={mod.icon} />
                  </ToneTile>
                }
                title={mod.title}
                subtitle={`${mod.minutes} Min. · ${mod.quiz.length} Fragen`}
                detail={!own.passed && !own.outdated && own.attempts > 0 ? `${own.bestScore} %` : undefined}
                trailing={
                  own.passed ? (
                    <Pill tone="accent">
                      <IconCheck className="h-3 w-3" />
                      Bestanden
                    </Pill>
                  ) : own.outdated ? (
                    <Pill tone="warn">Neu ablegen</Pill>
                  ) : undefined
                }
              />
            </li>
          );
        })}
      </ul>

      <ListLabel>Rote Linien – gelten immer</ListLabel>
      <div className="surface p-4">
        <RuleList rules={RED_LINES.map((line) => ({ kind: "dont" as const, ...line }))} />
      </div>

      <p className="list-footer">Die Akademie ersetzt keine Rechtsberatung. Bei Fragen hilft dir die Leitung.</p>
    </div>
  );
}
