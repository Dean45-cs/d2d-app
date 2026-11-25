import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createGoal } from "@/lib/ranks";

export const dynamic = "force-dynamic";

/** Neues Ziel fuer den Aufstieg in diesen Rang. */
export async function POST(request: Request, { params }: { params: Promise<{ tier: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { tier } = await params;
    return { ok: true, id: createGoal(user, tier, (await request.json()) ?? {}) };
  });
}
