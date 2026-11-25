import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { deleteGoal, updateGoal } from "@/lib/ranks";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    updateGoal(user, Number(id), (await request.json()) ?? {});
    return { ok: true };
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    deleteGoal(user, Number(id));
    return { ok: true };
  });
}
