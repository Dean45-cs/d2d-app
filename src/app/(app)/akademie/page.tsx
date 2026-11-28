import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { ACADEMY_MODULES, PASS_PERCENT, RED_LINES } from "@/lib/academy/content";
import { passedCount, progressFor } from "@/lib/academy/store";
import { RED_LINES_VIDEO, academyVideo, videoLength } from "@/lib/academy/videos";
import { ModuleGlyph, RuleList } from "@/components/academy/parts";
import { LessonVideo } from "@/components/academy/LessonVideo";
import { Cell, ListLabel, PageHeader, Pill, ProgressRing, ToneTile } from "@/components/ui";
import { IconCheck, IconChevronDown, IconUsers } from "@/components/icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Akademie" };

/**
 * Die Akademie: Verhaltensstandards an der Haustuer in sechs Modulen, je mit
 * Erklaervideo und Quiz - vorneweg das Video zu den roten Linien, die immer
 * gelten. Wer die Teamauswertung sehen darf, sieht oben rechts den Stand des
 * Teams.
 */
export default async function AcademyPage() {
  const user = await requireUser();
  const rights = permissionsFor(user);
  const progress = progressFor(user.id);
  const passed = passedCount(progress);
  const total = ACADEMY_MODULES.length;
  const nextUp = ACADEMY_MODULES.find((_, index) => !progress[index].passed);
  const redLines = academyVideo(RED_LINES_VIDEO);

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

      {/* Zuerst die roten Linien: ein Video, die Liste eingeklappt zum Nachlesen. */}
      <ListLabel>Zuerst: die roten Linien</ListLabel>
      {redLines && <LessonVideo video={redLines} chapters={false} />}
      <details className={`group surface ${redLines ? "mt-4" : ""}`} open={redLines ? undefined : true}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 text-body">Alle {RED_LINES.length} Linien zum Nachlesen</span>
          <IconChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-separator px-4 pb-4 pt-4">
          <RuleList rules={RED_LINES.map((line) => ({ kind: "dont" as const, ...line }))} />
        </div>
      </details>

      <ListLabel>Module</ListLabel>
      <ul className="list list-icons">
        {ACADEMY_MODULES.map((mod, index) => {
          const own = progress[index];
          const video = academyVideo(mod.id);
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
                subtitle={
                  video
                    ? `Video ${videoLength(video.duration)} · ${mod.quiz.length} Fragen`
                    : `${mod.minutes} Min. · ${mod.quiz.length} Fragen`
                }
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

      <p className="list-footer">Die Akademie ersetzt keine Rechtsberatung. Bei Fragen hilft dir die Leitung.</p>
    </div>
  );
}
