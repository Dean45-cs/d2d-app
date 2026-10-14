"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import {
  IconChat,
  IconCheck,
  IconChevronDown,
  IconComment,
  IconHeart,
  IconSend,
  IconTrash,
} from "@/components/icons";
import { Menu, MenuItem } from "@/components/Menu";
import { useToast } from "@/components/Toast";
import { Avatar, EmptyState, InlineError, Pill } from "@/components/ui";
import { useConfirm } from "@/components/useConfirm";
import { timeAgo } from "@/lib/format";
import type { FeedComment, FeedPost } from "@/lib/community";

export interface Viewer {
  id: number;
  name: string;
  avatar: string;
  isLeader: boolean;
}

const MAX_POST = 500;
const MAX_COMMENT = 300;

/** Ein-Tipp-Antworten unter einem Abschluss - gratulieren geht so im Vorbeigehen. */
const CHEERS = ["Glückwunsch!", "Gut gemacht!", "Danke fürs Teilen!"];

const PRODUCT: Record<string, string> = { STROM: "Strom", GAS: "Gas", BEIDES: "Strom + Gas" };

/** Runde Abschluesse bekommen eine Plakette - wie in ranking.ts MILESTONES. */
const MILESTONES = new Set([5, 10, 25, 50, 100, 250, 500, 1000]);

/** Aenderung an einem Beitrag - als Funktion, damit sich gleichzeitige nicht ueberschreiben. */
type Change = (post: FeedPost) => FeedPost;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Das hat nicht geklappt.");
  return data as T;
}

/**
 * Der Feed: oben schreiben, darunter die Beitraege des Teams - Abschluesse
 * erscheinen von selbst. "query" bestimmt, welche Beitraege nachgeladen
 * werden (dieselben Filter wie auf dem Server).
 */
export function Feed({
  initial,
  hasMore: initialHasMore,
  query,
  viewer,
  composer = false,
  openComments = false,
  empty,
}: {
  initial: FeedPost[];
  hasMore: boolean;
  query: string;
  viewer: Viewer;
  composer?: boolean;
  /** Kommentare gleich aufgeklappt - auf der Seite eines einzelnen Beitrags. */
  openComments?: boolean;
  empty: { title: string; text?: string };
}) {
  const [posts, setPosts] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const show = useToast();

  async function loadMore() {
    const last = posts.at(-1);
    if (!last) return;
    setLoading(true);
    try {
      const data = await request<{ posts: FeedPost[]; hasMore: boolean }>(
        `/api/feed?${query}${query ? "&" : ""}before=${last.id}`,
      );
      setPosts((current) => [...current, ...data.posts.filter((p) => !current.some((c) => c.id === p.id))]);
      setHasMore(data.hasMore);
    } catch (error) {
      show(error instanceof Error ? error.message : "Keine Verbindung.");
    } finally {
      setLoading(false);
    }
  }

  const update = (id: number, change: Change) =>
    setPosts((current) => current.map((p) => (p.id === id ? change(p) : p)));
  const remove = (id: number) => setPosts((current) => current.filter((p) => p.id !== id));

  return (
    <>
      {composer && (
        <Composer viewer={viewer} onPosted={(post) => setPosts((current) => [post, ...current])} />
      )}

      {posts.length === 0 ? (
        <EmptyState boxed icon={<IconChat className="h-6 w-6" />} title={empty.title} text={empty.text} />
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard
                post={post}
                viewer={viewer}
                defaultOpen={openComments}
                onChange={(change) => update(post.id, change)}
                onRemove={() => remove(post.id)}
                onError={show}
              />
            </li>
          ))}
        </ul>
      )}

      {hasMore && posts.length > 0 && (
        <button
          type="button"
          className="btn btn-plain btn-block mt-3"
          onClick={() => void loadMore()}
          disabled={loading}
        >
          {loading ? "Lädt …" : "Ältere laden"}
          {!loading && <IconChevronDown className="h-4 w-4" />}
        </button>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/*                                 Schreiben                                 */
/* ------------------------------------------------------------------------ */

function Composer({ viewer, onPosted }: { viewer: Viewer; onPosted: (post: FeedPost) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await request<{ post: FeedPost }>("/api/feed", {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
      onPosted(data.post);
      setText("");
      if (ref.current) ref.current.style.height = "";
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Nicht gesendet.");
    } finally {
      setBusy(false);
    }
  }

  const left = MAX_POST - text.length;
  return (
    <form onSubmit={submit} className="mb-4 flex gap-3 rounded-xl bg-surface p-4">
      <Avatar name={viewer.name} src={viewer.avatar} size={36} />
      <div className="min-w-0 flex-1">
        <label htmlFor="compose" className="sr-only">
          Neuer Beitrag
        </label>
        <textarea
          id="compose"
          ref={ref}
          className="field field-bare min-h-11 resize-none py-2"
          rows={1}
          maxLength={MAX_POST}
          placeholder="Nachricht ans Team"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Mitwachsen statt rollen - bis der Beitrag fertig ist.
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 260)}px`;
          }}
        />
        {error && (
          <div className="mt-2">
            <InlineError>{error}</InlineError>
          </div>
        )}
        {text.trim() && (
          <div className="mt-2 flex items-center justify-end gap-3">
            {left <= 80 && (
              <span className={`text-footnote ${left <= 20 ? "text-danger" : "text-muted"}`}>{left}</span>
            )}
            <button className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? "Posten …" : "Posten"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------------ */
/*                                  Beitrag                                  */
/* ------------------------------------------------------------------------ */

function PostCard({
  post,
  viewer,
  defaultOpen,
  onChange,
  onRemove,
  onError,
}: {
  post: FeedPost;
  viewer: Viewer;
  defaultOpen: boolean;
  onChange: (change: Change) => void;
  onRemove: () => void;
  onError: (text: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [liking, setLiking] = useState(false);
  const { confirm, dialog } = useConfirm();
  const canDelete = post.kind === "TEXT" && (post.user.id === viewer.id || viewer.isLeader);
  const isMine = post.user.id === viewer.id;

  async function toggleLike() {
    if (liking) return;
    const next = !post.liked;
    // Sofort zeigen, dann speichern - ein Herz soll nicht auf das Netz warten.
    onChange((p) => ({ ...p, liked: next, like_count: p.like_count + (next ? 1 : -1) }));
    setLiking(true);
    try {
      const data = await request<{ liked: boolean; like_count: number }>(
        `/api/posts/${post.id}/like`,
        { method: next ? "POST" : "DELETE" },
      );
      onChange((p) => ({ ...p, liked: data.liked, like_count: data.like_count }));
    } catch (error) {
      onChange((p) => ({ ...p, liked: !next, like_count: p.like_count + (next ? -1 : 1) }));
      onError(error instanceof Error ? error.message : "Keine Verbindung.");
    } finally {
      setLiking(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Beitrag löschen?",
      text: "Der Beitrag verschwindet samt Kommentaren aus dem Feed.",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    try {
      await request(`/api/posts/${post.id}`, { method: "DELETE" });
      onRemove();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Keine Verbindung.");
    }
  }

  return (
    <article className="rounded-xl bg-surface px-4 pb-2 pt-4">
      <header className="flex items-center gap-3">
        <Link href={`/profil/${post.user.id}`} className="shrink-0 rounded-full" aria-label={post.user.name}>
          <Avatar name={post.user.name} src={post.user.avatar} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/profil/${post.user.id}`} className="block truncate text-headline">
            {post.user.name}
          </Link>
          <Link href={`/team/beitrag/${post.id}`} className="block text-footnote text-muted">
            <time dateTime={post.created_at} suppressHydrationWarning>
              {timeAgo(post.created_at)}
            </time>
          </Link>
        </div>
        {canDelete && (
          <Menu label="Aktionen für diesen Beitrag">
            <MenuItem icon={<IconTrash className="h-5 w-5" />} onSelect={() => void remove()} tone="danger">
              Beitrag löschen
            </MenuItem>
          </Menu>
        )}
      </header>

      {post.body && <p className="mt-3 whitespace-pre-wrap break-words text-body">{post.body}</p>}

      {post.sale && <SaleRow sale={post.sale} mine={isMine} />}

      <div className="-ml-3 mt-2 flex items-center">
        <button
          type="button"
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-subhead font-semibold hover:bg-hover ${
            open ? "text-ink" : "text-muted"
          }`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${post.comment_count} Kommentare`}
        >
          <IconComment className="h-5 w-5" />
          <span>{post.comment_count || ""}</span>
        </button>
        <button
          type="button"
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-subhead font-semibold hover:bg-hover ${
            post.liked ? "text-ink" : "text-muted"
          }`}
          onClick={() => void toggleLike()}
          aria-pressed={post.liked}
          aria-label={post.liked ? "Gefällt mir nicht mehr" : "Gefällt mir"}
        >
          <IconHeart className={`h-5 w-5 ${post.liked ? "check-pop" : ""}`} filled={post.liked} />
          <span>{post.like_count || ""}</span>
        </button>
      </div>

      <Comments
        post={post}
        viewer={viewer}
        open={open}
        onOpen={() => setOpen(true)}
        onChange={onChange}
        onError={onError}
      />
      {dialog}
    </article>
  );
}

/** Der Abschluss selbst: volles Gruen mit Haken - das Ergebnis, um das es geht. */
function SaleRow({ sale, mine }: { sale: NonNullable<FeedPost["sale"]>; mine: boolean }) {
  const where = [sale.territory_name, sale.city].filter(Boolean).join(" · ");
  return (
    <div className="mt-3 flex items-center gap-3">
      <span className="glyph glyph-lg glyph-round glyph-result">
        <IconCheck className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-headline">Abschluss · {PRODUCT[sale.energy_type] ?? "Vertrag"}</span>
        {where && <span className="block truncate text-footnote text-muted">{where}</span>}
      </span>
      {sale.number > 0 &&
        (sale.number === 1 ? (
          <Pill tone="accent">{mine ? "Dein erster" : "Erster"}</Pill>
        ) : MILESTONES.has(sale.number) ? (
          <Pill tone="accent">Nr. {sale.number}</Pill>
        ) : (
          <span className="shrink-0 text-footnote text-muted">Nr. {sale.number}</span>
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*                                Kommentare                                 */
/* ------------------------------------------------------------------------ */

function Comments({
  post,
  viewer,
  open,
  onOpen,
  onChange,
  onError,
}: {
  post: FeedPost;
  viewer: Viewer;
  open: boolean;
  onOpen: () => void;
  onChange: (change: Change) => void;
  onError: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const hidden = post.comment_count - post.comments.length;

  async function loadAll() {
    setLoading(true);
    try {
      const data = await request<{ comments: FeedComment[] }>(`/api/posts/${post.id}/comments`);
      onChange((p) => ({ ...p, comments: data.comments, comment_count: data.comments.length }));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Keine Verbindung.");
    } finally {
      setLoading(false);
    }
  }

  async function send(body: string) {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const data = await request<{ comment: FeedComment }>(`/api/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      onChange((p) => ({
        ...p,
        comments: [...p.comments, data.comment],
        comment_count: p.comment_count + 1,
      }));
      setText("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Nicht gesendet.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(comment: FeedComment) {
    try {
      await request(`/api/comments/${comment.id}`, { method: "DELETE" });
      onChange((p) => ({
        ...p,
        comments: p.comments.filter((c) => c.id !== comment.id),
        comment_count: Math.max(0, p.comment_count - 1),
      }));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Keine Verbindung.");
    }
  }

  if (!open && post.comments.length === 0) return null;
  const cheer = post.kind === "SALE" && post.user.id !== viewer.id;

  return (
    <div className="mb-2 mt-1 space-y-3 border-t border-separator pt-3">
      {hidden > 0 && (
        <button
          type="button"
          className="link min-h-11"
          onClick={() => {
            onOpen();
            void loadAll();
          }}
          disabled={loading}
        >
          {loading ? "Lädt …" : hidden === 1 ? "1 weiterer Kommentar" : `${hidden} weitere Kommentare`}
        </button>
      )}

      {post.comments.length > 0 && (
        <ul className="space-y-3">
          {post.comments.map((comment) => (
            <li key={comment.id} className="flex gap-2">
              <Link href={`/profil/${comment.user.id}`} className="shrink-0 rounded-full" aria-label={comment.user.name}>
                <Avatar name={comment.user.name} src={comment.user.avatar} size={28} />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="inline-block max-w-full rounded-lg bg-fill px-3 py-2">
                  <Link href={`/profil/${comment.user.id}`} className="block text-footnote font-semibold">
                    {comment.user.name}
                  </Link>
                  <p className="whitespace-pre-wrap break-words text-subhead">{comment.body}</p>
                </div>
                <p className="mt-1 flex items-center gap-3 pl-3 text-caption text-muted">
                  <time dateTime={comment.created_at} suppressHydrationWarning>
                    {timeAgo(comment.created_at)}
                  </time>
                  {(comment.user.id === viewer.id || viewer.isLeader) && (
                    <button type="button" className="font-semibold" onClick={() => void remove(comment)}>
                      Löschen
                    </button>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <>
          {cheer && (
            <div className="chips" role="group" aria-label="Schnellantwort">
              {CHEERS.map((line) => (
                <button key={line} type="button" className="chip" onClick={() => void send(line)} disabled={busy}>
                  {line}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send(text);
            }}
          >
            <label htmlFor={`comment-${post.id}`} className="sr-only">
              Kommentar schreiben
            </label>
            <input
              id={`comment-${post.id}`}
              className="field min-h-11 min-w-0 flex-1 rounded-full py-2"
              placeholder="Kommentieren"
              maxLength={MAX_COMMENT}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoComplete="off"
            />
            <button
              className="icon-btn icon-btn-accent shrink-0"
              disabled={busy || !text.trim()}
              aria-label="Kommentar senden"
            >
              <IconSend className="h-5 w-5" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
