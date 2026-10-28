import { requirePermission } from "@/lib/permissions";
import { mergeTerritories } from "@/lib/territory-groups";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Teilgebiete derselben Gruppe in dieses Gebiet zusammenlegen: { ids: [...] }. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const leader = await requirePermission("territories.edit");
    const { id } = await params;
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).slice(0, 10) : [];
    return { ok: true, ...mergeTerritories(leader, Number(id), ids) };
  });
}
