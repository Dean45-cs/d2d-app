import { requireUser } from "@/lib/auth";
import {
  listAppointments,
  listOrders,
  orderTotals,
  salesWithoutOrder,
} from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { OrderList } from "./OrderList";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await requireUser();

  // Die Teamleitung sieht das ganze Team, der Aussendienst seine eigenen
  // Aufträge - dieselbe Trennung wie überall sonst in der App.
  const scope = user.role === "LEADER" ? {} : { userId: user.id };
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Aufträge & Termine"
        subtitle={
          user.role === "LEADER"
            ? "Bestätigungsanruf, Einreichung und Widerrufsfrist im Blick"
            : "Was nach der Tür noch zu tun ist"
        }
      />
      <OrderList
        orders={listOrders(user.team_id, { ...scope, limit: 100 })}
        appointments={listAppointments(user.team_id, {
          ...scope,
          includeDone: true,
          limit: 100,
        })}
        stats={orderTotals(user.team_id, { ...scope, since })}
        missingOrders={salesWithoutOrder(user.team_id, { ...scope, since })}
        isLeader={user.role === "LEADER"}
      />
    </div>
  );
}
