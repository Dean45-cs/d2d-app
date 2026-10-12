import type { LevelProgress } from "./levels";

/** Only a confirmed server response may change the displayed XP balance. */
export interface LevelFeedback {
  progress: LevelProgress;
  awardedXp: number;
  previousLevel: number;
  levelUp: boolean;
}

export function levelFeedbackText(feedback?: LevelFeedback): string {
  if (!feedback || feedback.awardedXp <= 0) return "";
  return `+${feedback.awardedXp.toLocaleString("de-DE")} XP${feedback.levelUp ? ` · Level ${feedback.progress.level} erreicht!` : ""}`;
}
