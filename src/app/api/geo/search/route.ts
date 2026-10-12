import { requireUser, AuthError } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { searchPlaces } from "@/lib/geo/osm";
import { handle, requireText } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Ortssuche fuer das Suchfeld ueber der Gebietskarte. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!hasPermission(user, "territories.create") && !hasPermission(user, "territories.edit")) throw new AuthError("Keine Berechtigung zur Gebietspflege.", 403);
    const body = await request.json();
    const query = requireText(body.query, "Suchbegriff", 120);
    if (query.length < 3) throw new Error("Bitte mindestens drei Zeichen eingeben.");
    return { ok: true, results: await searchPlaces(query) };
  });
}
