import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { deleteCommissionBonus, updateCommissionBonus } from "@/lib/commissions/store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    updateCommissionBonus(user, Number(id), body ?? {});
    return { ok: true };
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    deleteCommissionBonus(user, Number(id));
    return { ok: true };
  });
}
