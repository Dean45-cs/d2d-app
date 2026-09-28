import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { deleteComment, requireTeamComment } from "@/lib/community";

export const dynamic = "force-dynamic";

/** Kommentar loeschen: den eigenen, als Teamleitung jeden. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const comment = requireTeamComment(Number(id), user.team_id);
    if (comment.user_id !== user.id && user.role !== "LEADER") {
      throw new Error("Das ist nicht dein Kommentar.");
    }
    deleteComment(comment.id);
    return { ok: true };
  });
}
