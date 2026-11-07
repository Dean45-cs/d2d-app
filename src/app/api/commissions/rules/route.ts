import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { saveCommissionRule } from "@/lib/commissions/store";

export const dynamic = "force-dynamic";

/** Ausnahme anlegen oder ersetzen (je Sparte, Anbieter oder Tarif hoechstens eine). */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json();
    return { ok: true, id: saveCommissionRule(user, body ?? {}) };
  });
}
