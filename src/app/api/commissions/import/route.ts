import { requirePermission } from "@/lib/permissions";
import { handle } from "@/lib/api";
import { checkImportRows, commitCommissionImport } from "@/lib/commissions/store";

export const dynamic = "force-dynamic";

/** Die gelesene Liste uebernehmen - die Zeilen werden dabei noch einmal geprueft. */
export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requirePermission("commissions.manage");
    const body = await request.json();
    const rows = checkImportRows(body?.rows);
    return commitCommissionImport(leader, rows, {
      label: body?.label,
      validFrom: body?.validFrom,
      promoUntil: body?.promoUntil,
    });
  });
}
