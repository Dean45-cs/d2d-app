import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PASS_PERCENT, findModule, nextModule } from "@/lib/academy/content";
import { publicQuiz } from "@/lib/academy/score";
import { progressFor } from "@/lib/academy/store";
import { academyVideo, videoLength } from "@/lib/academy/videos";
import { sqlDay } from "@/lib/format";
import { ExampleBox, KeyPoints, RuleList } from "@/components/academy/parts";
import { LessonVideo } from "@/components/academy/LessonVideo";
import { Quiz } from "@/components/academy/Quiz";
import { ListLabel, Notice, PageHeader } from "@/components/ui";
import { IconCheckCircle, IconChevronDown, IconInfo } from "@/components/icons";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ modul: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return { title: findModule((await params).modul)?.title ?? "Akademie" };
}

/** "2026-11-28" -> "28.11.2026" */
function germanDate(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}.${month}.${year}`;
}

/**
 * Ein Modul: zuerst das Erklaervideo - es enthaelt alles Wichtige -, darunter
 * das Wichtigste in drei Saetzen, die Lektionen eingeklappt zum Nachlesen
 * und das Quiz. Die Lektionen entstehen auf dem Server; an den Browser
 * gehen nur die Fragen ohne Loesung.
 */
export default async function AcademyModulePage({ params }: Params) {
  const user = await requireUser();
  const mod = findModule((await params).modul);
  if (!mod) notFound();
  const own = progressFor(user.id).find((item) => item.moduleId === mod.id)!;
  const next = nextModule(mod.id);
  const video = academyVideo(mod.id);

  return (
    <div className="page-narrow">
      <PageHeader
        title={mod.title}
        subtitle={
          video
            ? `Video ${videoLength(video.duration)} · ${mod.quiz.length} Fragen`
            : `${mod.minutes} Min. · ${mod.lessons.length} Lektionen · ${mod.quiz.length} Fragen`
        }
        back={{ href: "/akademie", label: "Akademie" }}
      />

      {own.passed && own.passedAt ? (
        <div className="mb-4">
          <Notice icon={<IconCheckCircle className="h-5 w-5" />}>
            Bestanden am {germanDate(sqlDay(own.passedAt))}. Wiederholen kannst du jederzeit.
          </Notice>
        </div>
      ) : own.outdated ? (
        <div className="mb-4">
          <Notice icon={<IconInfo className="h-5 w-5" />}>Dieses Modul wurde überarbeitet – bitte das Quiz neu ablegen.</Notice>
        </div>
      ) : null}

      {video ? <LessonVideo video={video} /> : <p className="text-body text-ink-2">{mod.summary}</p>}

      <ListLabel>Das Wichtigste</ListLabel>
      <div className="surface p-4">
        <KeyPoints points={mod.keyPoints} />
      </div>

      {/* Alles aus dem Video zum Nachlesen - eingeklappt, das Video reicht. */}
      <details className="group surface mt-4">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 text-body">Alles zum Nachlesen</span>
          <span className="text-subhead text-muted">{mod.lessons.length} Lektionen</span>
          <IconChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-8 border-t border-separator px-4 pb-5 pt-5">
          {mod.lessons.map((lesson, index) => (
            <section key={lesson.title} aria-labelledby={`lektion-${index + 1}`}>
              <h2 id={`lektion-${index + 1}`} className="text-title-3">
                {index + 1}. {lesson.title}
              </h2>
              <p className="mt-2 text-body text-ink-2">{lesson.text}</p>
              <div className="mt-4">
                <RuleList rules={lesson.rules} />
              </div>
              {lesson.example && <ExampleBox example={lesson.example} />}
            </section>
          ))}
        </div>
      </details>

      <div className="mt-8">
        <Quiz
          moduleId={mod.id}
          questions={publicQuiz(mod)}
          passMark={PASS_PERCENT}
          passed={own.passed}
          attempts={own.attempts}
          bestScore={own.bestScore}
          next={next ? { id: next.id, title: next.title } : null}
        />
      </div>
    </div>
  );
}
