import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { updatePermissions } from "@/lib/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    updatePermissions(user, Number(id), body.permissions);
    return { ok: true };
  });
}
