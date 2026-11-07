import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { deleteCommissionRule } from "@/lib/commissions/store";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    deleteCommissionRule(user, Number(id));
    return { ok: true };
  });
}
