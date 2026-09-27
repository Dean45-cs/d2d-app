import { requireRole } from "@/lib/auth";
import { handle, ValidationError } from "@/lib/api";
import { deleteManualPrice } from "@/lib/energy/manual";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const leader = await requireRole("LEADER");
    const { id } = await params;
    if (!deleteManualPrice(leader.team_id, Number(id))) {
      throw new ValidationError("Eintrag nicht gefunden.");
    }
    return { ok: true };
  });
}
