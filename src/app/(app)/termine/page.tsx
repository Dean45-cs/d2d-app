import { requireUser } from "@/lib/auth";
import { listAppointments } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { AppointmentList } from "./AppointmentList";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const user = await requireUser();

  // Die Teamleitung sieht das ganze Team, der Aussendienst seine eigenen
  // Termine - dieselbe Trennung wie überall sonst in der App.
  const scope = user.role === "LEADER" ? {} : { userId: user.id };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Termine"
        subtitle="Was an der Tür vereinbart wurde – mit Uhrzeit und Rufnummer"
      />
      <AppointmentList
        appointments={listAppointments(user.team_id, {
          ...scope,
          includeDone: true,
          limit: 100,
        })}
        isLeader={user.role === "LEADER"}
      />
    </div>
  );
}
