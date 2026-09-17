import { requireRole } from "@/lib/auth";
import { searchPlaces } from "@/lib/geo/osm";
import { handle, requireText } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Ortssuche fuer das Suchfeld ueber der Gebietskarte. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireRole("LEADER");
    const body = await request.json();
    const query = requireText(body.query, "Suchbegriff", 120);
    if (query.length < 3) throw new Error("Bitte mindestens drei Zeichen eingeben.");
    return { ok: true, results: await searchPlaces(query) };
  });
}
