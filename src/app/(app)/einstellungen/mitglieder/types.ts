import type { User } from "@/lib/types";

/** Ein Mitglied, wie es die Verwaltung zeigt: Konto, Zahlen, laufende Gebiete. */
export type MemberRow = User & {
  doors: number;
  met: number;
  sales: number;
  territories: Array<{ id: number; name: string; open: boolean }>;
};

/** PATCH /api/team/[id] - meldet Erfolg, Fehler kommen als Toast. */
export type PatchMember = (
  id: number,
  body: Record<string, unknown>,
  done: string,
  undo?: Record<string, unknown>,
) => Promise<boolean>;

export const ROLE_LABEL = { LEADER: "Teamleitung", MEMBER: "Vertrieb" } as const;
