import manifest from "./videos.json";

/**
 * Die Erklaervideos der Akademie. Sie entstehen mit video/akademie/render.ts
 * (npm run akademie:videos) und liegen unter public/akademie/; dieses
 * Manifest schreibt der Renderer mit - Laenge, Kapitel und den
 * Fingerabdruck des Drehbuchs, aus dem das Video entstand.
 */
export interface AcademyVideo {
  title: string;
  src: string;
  poster: string;
  /** Untertitel (WebVTT), im Player standardmaessig an. */
  captions: string;
  /** Laenge in Sekunden. */
  duration: number;
  chapters: Array<{ t: number; title: string }>;
  /** Fingerabdruck des Drehbuchs - weicht er ab, ist das Video veraltet (npm test). */
  script: string;
}

/** Id des Videos zu den roten Linien; die Module haben ihre eigene Id. */
export const RED_LINES_VIDEO = "rote-linien";

const VIDEOS = manifest as Record<string, AcademyVideo>;

/** Das Video zu einem Modul oder zu den roten Linien - null, wenn es (noch) keins gibt. */
export function academyVideo(id: string): AcademyVideo | null {
  return VIDEOS[id] ?? null;
}

/** 193.2 -> "3:13" */
export function videoLength(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
