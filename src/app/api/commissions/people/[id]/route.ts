import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { setPersonCommission } from "@/lib/commissions/store";

export const dynamic = "force-dynamic";

/**
 * Individueller Satz einer Person: { value: 68 } oder { value: null } fuer "nach Stufe".
 * Wer das darf, prueft setPersonCommission (nur mit "Provisionen verwalten").
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    setPersonCommission(user, Number(id), body?.value ?? null);
    return { ok: true };
  });
}
