import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { updateCard } from "@/lib/card-queries";

export const dynamic = "force-dynamic";

/**
 * Die eigene Visitenkarte: ein- und ausschalten, Rufnummer zeigen, neuer
 * Link. Jede Person entscheidet selbst - die Karte zeigt ihr Bild oeffentlich.
 */
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const change: { enabled?: boolean; showPhone?: boolean; renew?: boolean } = {};
    if (body.enabled !== undefined) change.enabled = body.enabled === true;
    if (body.showPhone !== undefined) change.showPhone = body.showPhone === true;
    if (body.renew === true) change.renew = true;
    const settings = updateCard(user.id, change);
    return { token: settings.token, showPhone: settings.showPhone };
  });
}
