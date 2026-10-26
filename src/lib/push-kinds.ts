/*
 * Worueber Push-Nachrichten kommen - ohne Datenbank, damit auch die
 * Einstellungen im Browser die Liste kennen. Gespeichert wird in push.ts.
 */

export const PUSH_KINDS = ["sale", "comment", "follow", "reminder"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

export function isPushKind(value: unknown): value is PushKind {
  return typeof value === "string" && (PUSH_KINDS as readonly string[]).includes(value);
}
