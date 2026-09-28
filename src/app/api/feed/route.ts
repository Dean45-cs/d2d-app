import { requireUser } from "@/lib/auth";
import { handle, optionalNumber, requireText } from "@/lib/api";
import {
  MAX_POST_CHARS,
  createPost,
  getPost,
  listFeed,
  requireTeamPerson,
  type FeedScope,
} from "@/lib/community";

export const dynamic = "force-dynamic";

/** Seite des Feeds - "before" ist die ID des letzten Beitrags der vorigen Seite. */
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(request.url);
    const scope = readScope(url.searchParams, user.team_id);
    const posts = listFeed(user.team_id, user.id, {
      scope,
      before: optionalNumber(url.searchParams.get("before")),
      limit: 20,
    });
    return { posts, hasMore: posts.length === 20 };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json();
    const text = requireText(body.body, "Der Beitrag", MAX_POST_CHARS);
    const id = createPost(user.team_id, user.id, text);
    return { post: getPost(id, user.team_id, user.id) };
  });
}

function readScope(params: URLSearchParams, teamId: number): FeedScope {
  const scope = params.get("scope");
  if (scope === "following") return { kind: "following" };
  const userId = optionalNumber(params.get("user"));
  if (userId !== null && (scope === "user" || scope === "sales" || scope === "liked")) {
    requireTeamPerson(userId, teamId);
    return { kind: scope, userId };
  }
  return { kind: "all" };
}
