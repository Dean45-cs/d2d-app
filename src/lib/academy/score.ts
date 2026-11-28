import { PASS_PERCENT, type AcademyModule } from "./content";

/**
 * Auswertung des Quiz - ohne Datenbank, damit Server und Tests dieselbe
 * Regel benutzen. Der Browser bekommt nur publicQuiz(): Fragen und
 * Antworten ohne Loesung. Ob eine Antwort stimmt, sagt erst der Server.
 *
 * Fehler werfen ein schlichtes Error - handle() in src/lib/api.ts macht
 * daraus eine 400 mit dem Text.
 */

/** Eine Frage, wie sie der Browser sieht. */
export interface PublicQuestion {
  id: string;
  text: string;
  options: string[];
}

/** Rueckmeldung zu einer Antwort. */
export interface AnswerCheck {
  correct: boolean;
  /** Index der richtigen Antwort. */
  answer: number;
  explanation: string;
}

export interface AttemptScore {
  correct: number;
  total: number;
  /** Prozent, gerundet. */
  score: number;
  passed: boolean;
}

/** Fragen ohne Loesung und Erklaerung. */
export function publicQuiz(mod: AcademyModule): PublicQuestion[] {
  return mod.quiz.map(({ id, text, options }) => ({ id, text, options: [...options] }));
}

/** Prozent richtiger Antworten, gerundet. */
export function percentOf(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

/** Eine einzelne Antwort pruefen - fuer die Rueckmeldung direkt nach dem Tippen. */
export function checkAnswer(mod: AcademyModule, question: unknown, choice: unknown): AnswerCheck {
  const index = readIndex(question, mod.quiz.length, "Diese Frage gibt es nicht.");
  const item = mod.quiz[index];
  const picked = readIndex(choice, item.options.length, "Diese Antwort gibt es nicht.");
  return { correct: picked === item.answer, answer: item.answer, explanation: item.explanation };
}

/** Die Antworten eines Durchgangs lesen: je Frage genau eine, in der Reihenfolge des Moduls. */
export function readAnswers(mod: AcademyModule, value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== mod.quiz.length) {
    throw new Error("Bitte beantworte alle Fragen.");
  }
  return value.map((choice, index) =>
    readIndex(choice, mod.quiz[index].options.length, "Diese Antwort gibt es nicht."),
  );
}

/** Einen ganzen Durchgang werten. */
export function scoreAttempt(mod: AcademyModule, answers: number[]): AttemptScore {
  const total = mod.quiz.length;
  const correct = mod.quiz.filter((question, index) => answers[index] === question.answer).length;
  const score = percentOf(correct, total);
  return { correct, total, score, passed: score >= PASS_PERCENT };
}

function readIndex(value: unknown, length: number, message: string): number {
  const index = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(index) || index < 0 || index >= length) throw new Error(message);
  return index;
}
