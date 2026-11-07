import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { updateCommissionTariff } from "@/lib/commissions/store";

export const dynamic = "force-dynamic";

/** Sparte, Kundenart, Sichtbarkeit und Notiz eines Tarifs - die Betraege kommen nur aus der Liste. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    updateCommissionTariff(user, Number(id), body ?? {});
    return { ok: true };
  });
}
