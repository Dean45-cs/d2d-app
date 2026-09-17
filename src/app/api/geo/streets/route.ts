import { requireRole } from "@/lib/auth";
import { parseArea } from "@/lib/geo/area";
import { streetsInArea } from "@/lib/geo/osm";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Liefert alle Strassen innerhalb der auf der Karte gezeichneten Flaeche.
 * Das Ergebnis wird noch nicht gespeichert - die Teamleitung waehlt erst aus,
 * welche Strassen ins Gebiet wandern.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireRole("LEADER");
    const body = await request.json();
    const area = parseArea(body.area);
    const result = await streetsInArea(area);
    return { ok: true, ...result };
  });
}
