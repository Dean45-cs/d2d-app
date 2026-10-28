import { requirePermission } from "@/lib/permissions";
import { reconcileTerritory } from "@/lib/territory-reconcile";
import { parseShape } from "@/lib/geo/area";
import { handle, parseStreetList } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Haeuser mit der Flaeche abgleichen: { area?, streetList, dryRun }.
 * Mit dryRun nur die Vorschau (was kommt dazu, was faellt weg), sonst
 * wird genau das gespeichert - samt neuer Flaeche, wenn eine mitkommt.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const leader = await requirePermission("territories.edit");
    const { id } = await params;
    const body = await request.json();
    const area = body.area ? parseShape(body.area) : undefined;
    const summary = reconcileTerritory(
      leader,
      Number(id),
      { area, streetList: parseStreetList(body.streetList) },
      body.dryRun !== true,
    );
    return { ok: true, ...summary };
  });
}
