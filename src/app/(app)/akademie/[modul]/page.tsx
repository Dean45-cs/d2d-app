import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PASS_PERCENT, findModule, nextModule } from "@/lib/academy/content";
import { publicQuiz } from "@/lib/academy/score";
import { progressFor } from "@/lib/academy/store";
import { sqlDay } from "@/lib/format";
import { ExampleBox, RuleList } from "@/components/academy/parts";
import { Quiz } from "@/components/academy/Quiz";
import { Notice, PageHeader } from "@/components/ui";
import { IconCheckCircle, IconInfo } from "@/components/icons";

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
 * Ein Modul: die Lektionen zum Lesen, darunter das Quiz. Die Lektionen
 * entstehen auf dem Server; an den Browser gehen nur die Fragen ohne
 * Loesung.
 */
export default async function AcademyModulePage({ params }: Params) {
  const user = await requireUser();
  const mod = findModule((await params).modul);
  if (!mod) notFound();
  const own = progressFor(user.id).find((item) => item.moduleId === mod.id)!;
  const next = nextModule(mod.id);

  return (
    <div className="page-narrow">
      <PageHeader
        title={mod.title}
        subtitle={`${mod.minutes} Min. · ${mod.lessons.length} Lektionen · ${mod.quiz.length} Fragen`}
        back={{ href: "/akademie", label: "Akademie" }}
      />

      {own.passed && own.passedAt ? (
        <Notice icon={<IconCheckCircle className="h-5 w-5" />}>
          Bestanden am {germanDate(sqlDay(own.passedAt))}. Wiederholen kannst du jederzeit.
        </Notice>
      ) : own.outdated ? (
        <Notice icon={<IconInfo className="h-5 w-5" />}>Dieses Modul wurde überarbeitet – bitte das Quiz neu ablegen.</Notice>
      ) : null}

      <p className={`text-body text-ink-2 ${own.passed || own.outdated ? "mt-4" : ""}`}>{mod.summary}</p>

      <div className="mt-6 space-y-8">
        {mod.lessons.map((lesson, index) => (
          <section key={lesson.title} aria-labelledby={`lektion-${index + 1}`}>
            <h2 id={`lektion-${index + 1}`} className="section-title mb-2.5">
              {index + 1}. {lesson.title}
            </h2>
            <div className="surface p-4">
              <p className="text-body text-ink-2">{lesson.text}</p>
              <div className="mt-4">
                <RuleList rules={lesson.rules} />
              </div>
              {lesson.example && <ExampleBox example={lesson.example} />}
            </div>
          </section>
        ))}

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
