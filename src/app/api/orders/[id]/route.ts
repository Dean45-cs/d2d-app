import { requireUser } from "@/lib/auth";
import { getOrder, setOrderStatus } from "@/lib/queries";
import { handle, optionalText } from "@/lib/api";
import { ORDER_STATUS_LABEL } from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

/**
 * Schritt in der Nachbearbeitung setzen.
 *
 * Bestaetigungsanruf, Einreichen beim Partner und die Rueckmeldung dazu sind
 * Sache der Teamleitung - der Aussendienst erfasst den Auftrag an der Tuer und
 * sieht danach nur noch, wo er steht.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    if (user.role !== "LEADER") throw new Error("Keine Berechtigung.");

    const { id } = await params;
    const order = getOrder(Number(id), user.team_id);
    if (!order) throw new Error("Auftrag nicht gefunden.");

    const body = await request.json();
    const next = optionalText(body.status, 20) as OrderStatus;
    if (!STATUS.includes(next)) throw new Error("Unbekannter Status.");

    setOrderStatus(order.id, next, user.id, optionalText(body.statusNote, 300));
    return { ok: true, status: next };
  });
}
