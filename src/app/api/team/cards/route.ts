import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { updateTeamCards } from "@/lib/card-queries";

export const dynamic = "force-dynamic";

/**
 * Visitenkarten des Teams: die Leitung schaltet sie fuer ihre Leute ein oder
 * aus oder erzeugt neue Links. Body: { ids: number[], enabled?: boolean, renew?: true }.
 */
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const change: { enabled?: boolean; renew?: boolean } = {};
    if (body.enabled !== undefined) change.enabled = body.enabled === true;
    if (body.renew === true) change.renew = true;
    return { changed: updateTeamCards(user, body.ids, change) };
  });
}
