import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createCommissionBonus } from "@/lib/commissions/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json();
    return { ok: true, id: createCommissionBonus(user, body ?? {}) };
  });
}
