import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { handle, requireText } from "@/lib/api";
import {
  MAX_COMMENT_CHARS,
  addComment,
  listComments,
  requireTeamPost,
} from "@/lib/community";
import { notifyComment } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const post = requireTeamPost(Number(id), user.team_id);
    return { comments: listComments(post.id) };
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const post = requireTeamPost(Number(id), user.team_id);
    const body = await request.json();
    const text = requireText(body.body, "Der Kommentar", MAX_COMMENT_CHARS);
    const comment = addComment(post.id, user.id, text);
    after(() =>
      notifyComment(post.id, { id: user.id, name: user.name }, text).catch((error) =>
        console.warn("[push] Kommentar:", error),
      ),
    );
    return { comment };
  });
}
