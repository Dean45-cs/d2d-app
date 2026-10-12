import { getDb } from "./db";
import { createVisit } from "./queries";

export interface VisitWriteResult {
  id: number | null;
  replayed: boolean;
  deleted: boolean;
}

/** IDs are generated before the first send and survive every offline retry. */
export function parseVisitRequestId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) {
    throw new Error("Ungültige Anfrage-ID.");
  }
  return value;
}

export function findVisitRequest(teamId: number, userId: number, key: string | null): VisitWriteResult | null {
  if (!key) return null;
  const row = getDb().prepare(
    "SELECT visit_id FROM visit_requests WHERE team_id = ? AND user_id = ? AND client_request_id = ?",
  ).get(teamId, userId, key) as { visit_id: number | null } | undefined;
  return row ? { id: row.visit_id, replayed: true, deleted: row.visit_id === null } : null;
}

/** Visit, sale post and retry marker either all commit or all roll back. */
export function createVisitOnce(
  teamId: number,
  userId: number,
  clientRequestId: string | null,
  input: Parameters<typeof createVisit>[0],
): VisitWriteResult {
  const db = getDb();
  const key = parseVisitRequestId(clientRequestId);
  return db.transaction(() => {
    if (input.teamId !== teamId || input.userId !== userId || !db.prepare(
      "SELECT id FROM users WHERE id = ? AND team_id = ? AND active = 1",
    ).get(userId, teamId)) throw new Error("Person nicht gefunden.");
    const existing = findVisitRequest(teamId, userId, key);
    if (existing) return existing;
    const id = createVisit(input);
    if (key) db.prepare(
      "INSERT INTO visit_requests (client_request_id, user_id, team_id, visit_id) VALUES (?, ?, ?, ?)",
    ).run(key, userId, teamId, id);
    return { id, replayed: false, deleted: false };
  }).immediate();
}
