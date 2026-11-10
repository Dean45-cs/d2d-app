import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { saveCommissionSettings } from "@/lib/commissions/store";

export const dynamic = "force-dynamic";

/** Standardsatz, Saetze der Stufen, Weitergabe von Aktions- und Folgeprovision - nur Geschicktes aendert sich. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json();
    return { ok: true, settings: saveCommissionSettings(user, body ?? {}) };
  });
}
