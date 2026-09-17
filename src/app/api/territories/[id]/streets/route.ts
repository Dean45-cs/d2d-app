import { requireRole } from "@/lib/auth";
import { addStreetEntries, addStreets, getTerritory } from "@/lib/queries";
import { handle, optionalText, parseStreetList } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const leader = await requireRole("LEADER");
    const { id } = await params;
    const territory = getTerritory(Number(id), leader.team_id);
    if (!territory) throw new Error("Gebiet nicht gefunden.");

    const body = await request.json();

    // Entweder kommen die Strassen aus der Kartenauswahl oder als eingefuegte Liste.
    const fromMap = parseStreetList(body.streetList);
    if (fromMap.length > 0) {
      return { ok: true, added: addStreetEntries(territory.id, fromMap) };
    }

    const raw = optionalText(body.streets, 20000);
    if (!raw) throw new Error("Straßenliste darf nicht leer sein.");
    return { ok: true, added: addStreets(territory.id, raw) };
  });
}
