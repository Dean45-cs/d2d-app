import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { deletePost, getPost, requireTeamPost } from "@/lib/community";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const post = getPost(Number(id), user.team_id, user.id);
    if (!post) throw new Error("Beitrag nicht gefunden.");
    return { post };
  });
}

/**
 * Beitrag loeschen: den eigenen, als Teamleitung jeden. Ein Abschluss
 * haengt am Eintrag an der Tuer und verschwindet nur mit ihm - sonst liesse
 * sich ein Vertrag aus dem Feed tilgen, der in den Zahlen weiter zaehlt.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const post = requireTeamPost(Number(id), user.team_id);
    if (post.kind === "SALE") {
      throw new Error("Ein Abschluss lässt sich nur über den Eintrag an der Tür zurücknehmen.");
    }
    if (post.user_id !== user.id && user.role !== "LEADER") {
      throw new Error("Das ist nicht dein Beitrag.");
    }
    deletePost(post.id);
    return { ok: true };
  });
}
