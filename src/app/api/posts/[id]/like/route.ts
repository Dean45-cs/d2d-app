import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { requireTeamPost, setLike } from "@/lib/community";

export const dynamic = "force-dynamic";

async function toggle(params: Promise<{ id: string }>, liked: boolean) {
  const user = await requireUser();
  const { id } = await params;
  const post = requireTeamPost(Number(id), user.team_id);
  return setLike(post.id, user.id, liked);
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() => toggle(params, true));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() => toggle(params, false));
}
