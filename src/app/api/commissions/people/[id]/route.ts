import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { setPersonCommission } from "@/lib/commissions/store";

export const dynamic = "force-dynamic";

/**
 * Was eine Person bekommt: { value: 80 } oder { value: null } fuer Standard.
 * Wer das darf, prueft setPersonCommission (Verwaltung oder direkte Fuehrungskraft).
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
