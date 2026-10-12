import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { decideInvitation, revokeInvitation } from "@/lib/invitations";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    if (body.decision !== "APPROVED" && body.decision !== "REJECTED") throw new Error("Ungültige Entscheidung.");
    return decideInvitation(user.id, Number(id), body.decision);
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return handle(async () => revokeInvitation((await requireUser()).id, Number((await params).id)));
}
