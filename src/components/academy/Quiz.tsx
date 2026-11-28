"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ProgressBar } from "@/components/ui";
import { IconCheck, IconCheckCircle, IconX } from "@/components/icons";
import type { AnswerCheck, PublicQuestion } from "@/lib/academy/score";
import { fetchWithTimeout } from "@/lib/offline-queue";
import { powerSaving } from "@/lib/power";

interface Result {
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  /** Bestandene Module danach - und wie viele es gibt. */
  modulesPassed: number;
  modulesTotal: number;
}

/** Sanft scrollen - ausser bei reduzierter Bewegung, im Energiesparmodus oder mit "Bewegung aus". */
function scrollBehavior(): ScrollBehavior {
  const still =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    powerSaving() ||
    document.documentElement.dataset.motion === "off";
  return still ? "auto" : "smooth";
}

/** Antworten jeder Frage in neuer Reihenfolge - die Position verraet nichts. */
function shuffledOrders(questions: PublicQuestion[]): number[][] {
  return questions.map((question) => {
    const order = question.options.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  });
}

/**
 * Das Quiz am Ende eines Moduls: eine Frage nach der anderen, nach jeder
 * Antwort die Erklaerung (vom Server - der Browser kennt die Loesung
 * vorher nicht). Am Ende wertet der Server den ganzen Durchgang und haelt
 * den Stand fest.
 */
export function Quiz({
  moduleId,
  questions,
  passMark,
  passed,
  attempts,
  bestScore,
  next,
}: {
  moduleId: string;
  questions: PublicQuestion[];
  passMark: number;
  passed: boolean;
  attempts: number;
  bestScore: number;
  next: { id: string; title: string } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  // null: noch nicht gestartet. Sonst je Frage die Reihenfolge der Antworten.
  const [orders, setOrders] = useState<number[][] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [hits, setHits] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<AnswerCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Neue Frage oder Ergebnis: das Quiz oben ins Bild, der Fokus auf die Frage - die Seite davor ist lang.
  const step = orders === null ? -1 : result ? questions.length : index;
  useEffect(() => {
    if (step < 0) return;
    sectionRef.current?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Nach der Antwort: Erklaerung und "Weiter" ins Bild, frei von der Reiterleiste.
  useEffect(() => {
    if (feedback) answerRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }, [feedback]);

  function start() {
    setOrders(shuffledOrders(questions));
    setIndex(0);
    setAnswers([]);
    setHits(0);
    setPicked(null);
    setFeedback(null);
    setResult(null);
  }

  async function choose(choice: number) {
    if (busy || feedback) return;
    setBusy(true);
    setPicked(choice);
    try {
      const response = await fetchWithTimeout(`/api/academy/${moduleId}/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: index, choice }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPicked(null);
        toast(data.error ?? "Antwort nicht geprüft");
        return;
      }
      const check = data as AnswerCheck;
      setFeedback(check);
      setAnswers((previous) => [...previous, choice]);
      if (check.correct) setHits((count) => count + 1);
    } catch {
      setPicked(null);
      toast("Ohne Verbindung nicht möglich");
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (index < questions.length - 1) {
      setIndex(index + 1);
      setPicked(null);
      setFeedback(null);
      return;
    }
    setBusy(true);
    try {
      const response = await fetchWithTimeout(`/api/academy/${moduleId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast(data.error ?? "Nicht gespeichert");
        return;
      }
      setResult(data as Result);
      // Kopf, Uebersicht und Profil zeigen den neuen Stand.
      router.refresh();
    } catch {
      toast("Ohne Verbindung nicht möglich – tippe gleich noch einmal");
    } finally {
      setBusy(false);
    }
  }

  const question = questions[index];

  return (
    <section ref={sectionRef} id="quiz" aria-labelledby="quiz-heading" className="scroll-mt-24">
      <h2 id="quiz-heading" className="section-title mb-2.5">
        Quiz
      </h2>

      {orders === null ? (
        <div className="surface p-4">
          <p className="text-body">
            {questions.length} Fragen – bestanden ab {passMark} % richtiger Antworten. Nach jeder Antwort siehst du,
            warum sie stimmt oder nicht.
          </p>
          {attempts > 0 && (
            <p className="mt-1 text-footnote text-muted">
              {passed ? "Bestanden" : "Noch nicht bestanden"} · bestes Ergebnis {bestScore} %
            </p>
          )}
          <button type="button" className="btn btn-primary btn-block mt-4" onClick={start}>
            {passed ? "Quiz wiederholen" : attempts > 0 ? "Nochmal versuchen" : "Quiz starten"}
          </button>
        </div>
      ) : result ? (
        <div className="surface px-4 py-6 text-center">
          <span
            className={`check-pop mx-auto grid h-16 w-16 place-items-center rounded-full ${
              result.passed ? "bg-accent-tint text-accent-ink" : "bg-fill text-muted"
            }`}
            aria-hidden="true"
          >
            {result.passed ? <IconCheckCircle className="h-9 w-9" /> : <span className="kpi text-title-3">{result.score} %</span>}
          </span>
          <h3 ref={headingRef} tabIndex={-1} className="mt-4 text-title-2 outline-none">
            {result.passed ? "Bestanden" : "Noch nicht bestanden"}
          </h3>
          <p className="mt-1 text-subhead text-muted">
            {result.correct} von {result.total} richtig · {result.score} %
            {!result.passed && ` · bestanden ab ${passMark} %`}
          </p>
          {result.passed && result.modulesPassed === result.modulesTotal && (
            <p className="mt-3 text-body">Glückwunsch – du hast alle Module der Akademie bestanden.</p>
          )}
          <div className="mt-6 flex flex-col gap-2">
            {result.passed ? (
              next ? (
                <Link href={`/akademie/${next.id}`} className="btn btn-primary btn-block">
                  Weiter: {next.title}
                </Link>
              ) : (
                <Link href="/akademie" className="btn btn-primary btn-block">
                  Zur Übersicht
                </Link>
              )
            ) : (
              <button type="button" className="btn btn-primary btn-block" onClick={start}>
                Nochmal versuchen
              </button>
            )}
            {(!result.passed || next) && (
              <Link href="/akademie" className="btn btn-secondary btn-block">
                Zur Übersicht
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="surface p-4">
          <div className="flex items-baseline justify-between gap-3 text-footnote text-muted">
            <span>
              Frage {index + 1} von {questions.length}
            </span>
            <span>{hits} richtig</span>
          </div>
          <ProgressBar
            value={index + (feedback ? 1 : 0)}
            max={questions.length}
            label="Fortschritt im Quiz"
            className="mt-2"
          />
          <h3 ref={headingRef} tabIndex={-1} id="quiz-question" className="mt-4 text-title-3 outline-none">
            {question.text}
          </h3>
          <div role="group" aria-labelledby="quiz-question" className="mt-4 space-y-2">
            {orders[index].map((option) => {
              const isAnswer = feedback !== null && option === feedback.answer;
              const isWrongPick = feedback !== null && option === picked && !feedback.correct;
              const tone = isAnswer
                ? "bg-accent-tint text-accent-ink font-semibold"
                : isWrongPick
                  ? "bg-danger-tint text-danger font-semibold"
                  : feedback
                    ? "bg-fill text-muted"
                    : option === picked
                      ? "bg-fill-strong"
                      : "bg-fill hover:bg-hover active:bg-press";
              return (
                <button
                  key={option}
                  type="button"
                  disabled={busy || feedback !== null}
                  aria-pressed={option === picked}
                  onClick={() => choose(option)}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-body transition-colors ${tone}`}
                >
                  <span className="min-w-0 flex-1">{question.options[option]}</span>
                  {isAnswer && <IconCheck className="h-4 w-4 shrink-0" />}
                  {isWrongPick && <IconX className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div ref={answerRef} className="scroll-mb-28">
            <div aria-live="polite">
              {feedback && (
                <div className={`mt-4 rounded-xl p-3 ${feedback.correct ? "bg-accent-tint" : "bg-danger-tint"}`}>
                  <p className={`text-headline ${feedback.correct ? "text-accent-ink" : "text-danger"}`}>
                    {feedback.correct ? "Richtig" : "Nicht ganz"}
                  </p>
                  <p className="mt-1 text-body text-ink">{feedback.explanation}</p>
                </div>
              )}
            </div>

            {feedback && (
              <button type="button" className="btn btn-primary btn-block mt-4" onClick={advance} disabled={busy}>
                {index < questions.length - 1 ? "Weiter" : "Auswerten"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
