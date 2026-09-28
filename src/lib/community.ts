import { getDb } from "./db";
import type { Role } from "./types";

/*
 * Feed, Kommentare, "Gefällt mir", Abos und Profile.
 *
 * Alles bleibt im Team: jede Abfrage nimmt die Team-ID mit, und ein Beitrag,
 * ein Kommentar oder eine Person aus einem anderen Team gilt als "nicht
 * gefunden" - nicht als "keine Berechtigung", damit niemand fremde IDs
 * abtasten kann.
 */

/** Hoechstlaenge eines Beitrags - wie ein Tweet, nur etwas grosszuegiger. */
export const MAX_POST_CHARS = 500;
export const MAX_COMMENT_CHARS = 300;
export const MAX_BIO_CHARS = 160;

/** So viele Kommentare stehen im Feed direkt unter einem Beitrag. */
const COMMENT_PREVIEW = 2;

/* ================================ Personen =============================== */

/** Was die Oberflaeche von einer Person im Feed braucht. */
export interface PersonRef {
  id: number;
  name: string;
  avatar: string;
  role: Role;
}

export interface Profile extends PersonRef {
  bio: string;
  active: number;
  created_at: string;
  follower_count: number;
  following_count: number;
  post_count: number;
  /** Habe ich diese Person abonniert? */
  followed_by_me: boolean;
  /** Hat sie mich abonniert? */
  follows_me: boolean;
}

export function getProfile(userId: number, teamId: number, viewerId: number): Profile | null {
  const row = getDb()
    .prepare(
      `SELECT u.id, u.name, u.avatar, u.role, u.bio, u.active, u.created_at,
              (SELECT COUNT(*) FROM follows f
                 JOIN users x ON x.id = f.follower_id AND x.active = 1
                WHERE f.followee_id = u.id)                                AS follower_count,
              (SELECT COUNT(*) FROM follows f
                 JOIN users x ON x.id = f.followee_id AND x.active = 1
                WHERE f.follower_id = u.id)                                AS following_count,
              (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id)        AS post_count,
              EXISTS (SELECT 1 FROM follows f
                       WHERE f.follower_id = ? AND f.followee_id = u.id)   AS followed_by_me,
              EXISTS (SELECT 1 FROM follows f
                       WHERE f.follower_id = u.id AND f.followee_id = ?)   AS follows_me
         FROM users u
        WHERE u.id = ? AND u.team_id = ?`,
    )
    .get(viewerId, viewerId, userId, teamId) as
    | (Omit<Profile, "followed_by_me" | "follows_me"> & {
        followed_by_me: number;
        follows_me: number;
      })
    | undefined;
  if (!row) return null;
  return { ...row, followed_by_me: Boolean(row.followed_by_me), follows_me: Boolean(row.follows_me) };
}

/** Prueft, dass die Person zum Team gehoert und aktiv ist. */
export function requireTeamPerson(userId: number, teamId: number): PersonRef {
  const row = getDb()
    .prepare(
      "SELECT id, name, avatar, role FROM users WHERE id = ? AND team_id = ? AND active = 1",
    )
    .get(userId, teamId) as PersonRef | undefined;
  if (!row) throw new Error("Person nicht gefunden.");
  return row;
}

export function setBio(userId: number, bio: string): void {
  getDb().prepare("UPDATE users SET bio = ? WHERE id = ?").run(bio, userId);
}

export function setAvatar(userId: number, avatar: string): void {
  getDb().prepare("UPDATE users SET avatar = ? WHERE id = ?").run(avatar, userId);
}

/* ================================== Abos ================================= */

export function follow(followerId: number, followeeId: number): void {
  if (followerId === followeeId) throw new Error("Dich selbst kannst du nicht abonnieren.");
  getDb()
    .prepare(
      `INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)
       ON CONFLICT(follower_id, followee_id) DO NOTHING`,
    )
    .run(followerId, followeeId);
}

export function unfollow(followerId: number, followeeId: number): void {
  getDb()
    .prepare("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?")
    .run(followerId, followeeId);
}

/** Wer diese Person abonniert hat - die Empfaenger ihrer Abschluss-Nachricht. */
export function followerIds(userId: number): number[] {
  return (
    getDb()
      .prepare(
        `SELECT f.follower_id AS id FROM follows f
           JOIN users u ON u.id = f.follower_id AND u.active = 1
          WHERE f.followee_id = ?`,
      )
      .all(userId) as Array<{ id: number }>
  ).map((row) => row.id);
}

export interface PersonListItem extends PersonRef {
  bio: string;
  followed_by_me: boolean;
}

/** Abonnenten ("followers") oder Abonnierte ("following") einer Person. */
export function listConnections(
  userId: number,
  viewerId: number,
  direction: "followers" | "following",
): PersonListItem[] {
  const [match, other] =
    direction === "followers" ? ["followee_id", "follower_id"] : ["follower_id", "followee_id"];
  const rows = getDb()
    .prepare(
      `SELECT u.id, u.name, u.avatar, u.role, u.bio,
              EXISTS (SELECT 1 FROM follows m
                       WHERE m.follower_id = ? AND m.followee_id = u.id) AS followed_by_me
         FROM follows f
         JOIN users u ON u.id = f.${other} AND u.active = 1
        WHERE f.${match} = ?
        ORDER BY f.created_at DESC`,
    )
    .all(viewerId, userId) as Array<Omit<PersonListItem, "followed_by_me"> & { followed_by_me: number }>;
  return rows.map((row) => ({ ...row, followed_by_me: Boolean(row.followed_by_me) }));
}

/**
 * Vorschlaege zum Abonnieren: Kollegen, die man noch nicht abonniert hat -
 * wer zuletzt die meisten Vertraege gemacht hat, zuerst.
 */
export function followSuggestions(teamId: number, viewerId: number, limit = 4): PersonListItem[] {
  const rows = getDb()
    .prepare(
      `SELECT u.id, u.name, u.avatar, u.role, u.bio, 0 AS followed_by_me,
              (SELECT COUNT(*) FROM visits v
                WHERE v.user_id = u.id AND v.outcome = 'SALE'
                  AND v.created_at >= datetime('now', '-30 days')) AS recent_sales
         FROM users u
        WHERE u.team_id = ? AND u.active = 1 AND u.id <> ?
          AND NOT EXISTS (SELECT 1 FROM follows f
                           WHERE f.follower_id = ? AND f.followee_id = u.id)
        ORDER BY recent_sales DESC, u.name
        LIMIT ?`,
    )
    .all(teamId, viewerId, viewerId, limit) as Array<Omit<PersonListItem, "followed_by_me"> & { followed_by_me: number }>;
  return rows.map((row) => ({ ...row, followed_by_me: false }));
}

/* ================================== Feed ================================= */

export interface FeedComment {
  id: number;
  post_id: number;
  body: string;
  created_at: string;
  user: PersonRef;
}

export interface SaleInfo {
  energy_type: string;
  territory_name: string | null;
  city: string | null;
  /** Der wievielte Abschluss dieser Person das war. */
  number: number;
}

export interface FeedPost {
  id: number;
  kind: "TEXT" | "SALE";
  body: string;
  created_at: string;
  user: PersonRef;
  sale: SaleInfo | null;
  like_count: number;
  comment_count: number;
  liked: boolean;
  /** Die letzten Kommentare, aelteste zuerst. */
  comments: FeedComment[];
}

/**
 * Welche Beitraege: alle im Team, nur die abonnierten Leute (samt einem
 * selbst), nur die einer Person, nur ihre Abschluesse oder was sie mag.
 */
export type FeedScope =
  | { kind: "all" }
  | { kind: "following" }
  | { kind: "user"; userId: number }
  | { kind: "sales"; userId: number }
  | { kind: "liked"; userId: number };

interface PostRow {
  id: number;
  kind: "TEXT" | "SALE";
  body: string;
  created_at: string;
  user_id: number;
  user_name: string;
  user_avatar: string;
  user_role: Role;
  energy_type: string | null;
  territory_name: string | null;
  territory_city: string | null;
  sale_number: number | null;
  like_count: number;
  comment_count: number;
  liked: number;
}

const POST_SQL = `
  SELECT p.id, p.kind, p.body, p.created_at, p.user_id,
         u.name AS user_name, u.avatar AS user_avatar, u.role AS user_role,
         v.energy_type, t.name AS territory_name, t.city AS territory_city,
         CASE WHEN p.visit_id IS NULL THEN NULL ELSE
           (SELECT COUNT(*) FROM visits v2
             WHERE v2.user_id = p.user_id AND v2.outcome = 'SALE' AND v2.id <= p.visit_id)
         END AS sale_number,
         (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id)    AS like_count,
         (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) AS comment_count,
         EXISTS (SELECT 1 FROM post_likes l
                  WHERE l.post_id = p.id AND l.user_id = ?)            AS liked
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN visits v ON v.id = p.visit_id
    LEFT JOIN territories t ON t.id = v.territory_id
`;

export function listFeed(
  teamId: number,
  viewerId: number,
  opts: { scope: FeedScope; before?: number | null; limit?: number },
): FeedPost[] {
  const where = ["p.team_id = ?"];
  const params: number[] = [viewerId, teamId];
  const scope = opts.scope;
  if (scope.kind === "following") {
    where.push(
      "(p.user_id = ? OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?))",
    );
    params.push(viewerId, viewerId);
  } else if (scope.kind === "user") {
    where.push("p.user_id = ?");
    params.push(scope.userId);
  } else if (scope.kind === "sales") {
    where.push("p.user_id = ? AND p.kind = 'SALE'");
    params.push(scope.userId);
  } else if (scope.kind === "liked") {
    where.push("p.id IN (SELECT post_id FROM post_likes WHERE user_id = ?)");
    params.push(scope.userId);
  }
  if (opts.before) {
    where.push("p.id < ?");
    params.push(opts.before);
  }
  params.push(Math.min(50, opts.limit ?? 20));

  const rows = getDb()
    .prepare(`${POST_SQL} WHERE ${where.join(" AND ")} ORDER BY p.id DESC LIMIT ?`)
    .all(...params) as PostRow[];
  return withComments(rows, COMMENT_PREVIEW);
}

/** Ein einzelner Beitrag samt aller Kommentare - fuer den Link aus der Push-Nachricht. */
export function getPost(postId: number, teamId: number, viewerId: number): FeedPost | null {
  const row = getDb()
    .prepare(`${POST_SQL} WHERE p.id = ? AND p.team_id = ?`)
    .get(viewerId, postId, teamId) as PostRow | undefined;
  if (!row) return null;
  return withComments([row], null)[0];
}

function withComments(rows: PostRow[], preview: number | null): FeedPost[] {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(",");
  // Im Feed nur die letzten paar Kommentare je Beitrag, auf der Einzelseite alle.
  const limit =
    preview === null
      ? ""
      : `AND c.id IN (SELECT c2.id FROM post_comments c2 WHERE c2.post_id = c.post_id
                        ORDER BY c2.id DESC LIMIT ${Number(preview)})`;
  const comments = getDb()
    .prepare(
      `${COMMENT_SQL} WHERE c.post_id IN (${placeholders}) ${limit} ORDER BY c.post_id, c.id`,
    )
    .all(...ids) as CommentRow[];

  const byPost = new Map<number, FeedComment[]>();
  for (const comment of comments) {
    const list = byPost.get(comment.post_id) ?? [];
    list.push(toComment(comment));
    byPost.set(comment.post_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    body: row.body,
    created_at: row.created_at,
    user: { id: row.user_id, name: row.user_name, avatar: row.user_avatar, role: row.user_role },
    sale:
      row.kind === "SALE"
        ? {
            energy_type: row.energy_type ?? "",
            territory_name: row.territory_name,
            city: row.territory_city,
            number: row.sale_number ?? 0,
          }
        : null,
    like_count: row.like_count,
    comment_count: row.comment_count,
    liked: Boolean(row.liked),
    comments: byPost.get(row.id) ?? [],
  }));
}

export function createPost(teamId: number, userId: number, body: string): number {
  return getDb()
    .prepare("INSERT INTO posts (team_id, user_id, kind, body) VALUES (?, ?, 'TEXT', ?)")
    .run(teamId, userId, body).lastInsertRowid as number;
}

export function deletePost(postId: number): void {
  getDb().prepare("DELETE FROM posts WHERE id = ?").run(postId);
}

/** Prueft, dass der Beitrag zum Team gehoert - und wem er gehoert. */
export function requireTeamPost(
  postId: number,
  teamId: number,
): { id: number; user_id: number; kind: "TEXT" | "SALE"; visit_id: number | null } {
  const row = getDb()
    .prepare("SELECT id, user_id, kind, visit_id FROM posts WHERE id = ? AND team_id = ?")
    .get(postId, teamId) as
    | { id: number; user_id: number; kind: "TEXT" | "SALE"; visit_id: number | null }
    | undefined;
  if (!row) throw new Error("Beitrag nicht gefunden.");
  return row;
}

/** Der Beitrag zu einem Besuch - fuer die Push-Nachricht nach einem Abschluss. */
export function postForVisit(visitId: number): number | null {
  const row = getDb().prepare("SELECT id FROM posts WHERE visit_id = ?").get(visitId) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

/* =============================== Gefällt mir ============================= */

export function setLike(
  postId: number,
  userId: number,
  liked: boolean,
): { liked: boolean; like_count: number } {
  const db = getDb();
  if (liked) {
    db.prepare(
      `INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)
       ON CONFLICT(post_id, user_id) DO NOTHING`,
    ).run(postId, userId);
  } else {
    db.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?").run(postId, userId);
  }
  const { c } = db
    .prepare("SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?")
    .get(postId) as { c: number };
  return { liked, like_count: c };
}

/* ================================ Kommentare ============================= */

interface CommentRow {
  id: number;
  post_id: number;
  body: string;
  created_at: string;
  user_id: number;
  user_name: string;
  user_avatar: string;
  user_role: Role;
}

const COMMENT_SQL = `
  SELECT c.id, c.post_id, c.body, c.created_at, c.user_id,
         u.name AS user_name, u.avatar AS user_avatar, u.role AS user_role
    FROM post_comments c
    JOIN users u ON u.id = c.user_id
`;

function toComment(row: CommentRow): FeedComment {
  return {
    id: row.id,
    post_id: row.post_id,
    body: row.body,
    created_at: row.created_at,
    user: { id: row.user_id, name: row.user_name, avatar: row.user_avatar, role: row.user_role },
  };
}

export function listComments(postId: number): FeedComment[] {
  return (
    getDb().prepare(`${COMMENT_SQL} WHERE c.post_id = ? ORDER BY c.id`).all(postId) as CommentRow[]
  ).map(toComment);
}

export function addComment(postId: number, userId: number, body: string): FeedComment {
  const db = getDb();
  const id = db
    .prepare("INSERT INTO post_comments (post_id, user_id, body) VALUES (?, ?, ?)")
    .run(postId, userId, body).lastInsertRowid as number;
  return toComment(db.prepare(`${COMMENT_SQL} WHERE c.id = ?`).get(id) as CommentRow);
}

export function requireTeamComment(
  commentId: number,
  teamId: number,
): { id: number; user_id: number; post_id: number } {
  const row = getDb()
    .prepare(
      `SELECT c.id, c.user_id, c.post_id FROM post_comments c
         JOIN posts p ON p.id = c.post_id
        WHERE c.id = ? AND p.team_id = ?`,
    )
    .get(commentId, teamId) as { id: number; user_id: number; post_id: number } | undefined;
  if (!row) throw new Error("Kommentar nicht gefunden.");
  return row;
}

export function deleteComment(commentId: number): void {
  getDb().prepare("DELETE FROM post_comments WHERE id = ?").run(commentId);
}

/* ============================ Zahlen fuers Ranking ======================= */

export interface PersonTotals {
  user_id: number;
  user_name: string;
  avatar: string;
  role: Role;
  doors: number;
  met: number;
  sales: number;
  appointments: number;
}

/**
 * Zahlen je Person im Zeitraum [since, until) - Grundlage fuer Rangliste,
 * Vergleich und Profil. Alle aktiven Mitglieder stehen drin, auch mit null.
 */
export function teamTotals(
  teamId: number,
  range: { since?: string; until?: string } = {},
): PersonTotals[] {
  const join: string[] = [];
  const params: (string | number)[] = [];
  if (range.since) {
    join.push("AND v.created_at >= ?");
    params.push(range.since);
  }
  if (range.until) {
    join.push("AND v.created_at < ?");
    params.push(range.until);
  }
  params.push(teamId);
  return getDb()
    .prepare(
      `SELECT u.id AS user_id, u.name AS user_name, u.avatar, u.role,
              COUNT(v.id) AS doors,
              COALESCE(SUM(v.outcome IN ('MET_NO_SALE','APPOINTMENT','SALE')), 0) AS met,
              COALESCE(SUM(v.outcome = 'SALE'), 0)        AS sales,
              COALESCE(SUM(v.outcome = 'APPOINTMENT'), 0) AS appointments
         FROM users u
         LEFT JOIN visits v ON v.user_id = u.id ${join.join(" ")}
        WHERE u.team_id = ? AND u.active = 1
        GROUP BY u.id
        ORDER BY u.name`,
    )
    .all(...params) as PersonTotals[];
}

/** Tage mit Tueren und Abschluessen einer Person, der juengste zuerst. */
export function activeDays(
  userId: number,
  limit = 120,
): Array<{ day: string; doors: number; sales: number }> {
  return getDb()
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS doors, SUM(outcome = 'SALE') AS sales
         FROM visits WHERE user_id = ?
        GROUP BY day ORDER BY day DESC LIMIT ?`,
    )
    .all(userId, limit) as Array<{ day: string; doors: number; sales: number }>;
}

/** Der Tag mit den meisten Abschluessen - bei Gleichstand der juengste. */
export function bestDay(userId: number): { day: string; sales: number } | null {
  const row = getDb()
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS sales
         FROM visits WHERE user_id = ? AND outcome = 'SALE'
        GROUP BY day ORDER BY sales DESC, day DESC LIMIT 1`,
    )
    .get(userId) as { day: string; sales: number } | undefined;
  return row ?? null;
}
