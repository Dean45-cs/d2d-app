import { requireRole } from "@/lib/auth";
import { addStreets, createTerritory } from "@/lib/queries";
import { handle, optionalNumber, optionalText, requireText } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requireRole("LEADER");
    const body = await request.json();

    const id = createTerritory({
      teamId: leader.team_id,
      name: requireText(body.name, "Gebietsname"),
      city: optionalText(body.city, 120),
      postalCode: optionalText(body.postalCode, 10),
      assignedUserId: optionalNumber(body.assignedUserId),
      note: optionalText(body.note),
      dueDate: optionalText(body.dueDate, 10) || null,
    });

    const streetsRaw = optionalText(body.streets, 20000);
    const added = streetsRaw ? addStreets(id, streetsRaw) : 0;

    return { ok: true, id, streets: added };
  });
}
