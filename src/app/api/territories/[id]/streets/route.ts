import { requireRole } from "@/lib/auth";
import { addStreets, getTerritory } from "@/lib/queries";
import { handle, requireText } from "@/lib/api";

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
    const added = addStreets(
      territory.id,
      requireText(body.streets, "Straßenliste", 20000),
    );
    return { ok: true, added };
  });
}
