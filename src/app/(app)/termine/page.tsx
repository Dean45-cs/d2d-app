import { requireUser } from "@/lib/auth";
import { listAppointments, listMembers } from "@/lib/queries";
import { AppointmentList } from "./AppointmentList";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const user = await requireUser();
  const isLeader = user.role === "LEADER";

  // Die Teamleitung sieht das ganze Team, der Aussendienst seine eigenen
  // Termine - dieselbe Trennung wie überall sonst in der App.
  const scope = isLeader ? {} : { userId: user.id };

  // Gesichter nur, wo mehrere Leute in der Liste stehen.
  const faces: Record<number, string> = isLeader
    ? Object.fromEntries(listMembers(user.team_id).map((m) => [m.id, m.avatar]))
    : {};

  return (
    <div className="mx-auto max-w-3xl">
      <AppointmentList
        appointments={listAppointments(user.team_id, {
          ...scope,
          includeDone: true,
          limit: 100,
        })}
        isLeader={isLeader}
        faces={faces}
      />
    </div>
  );
}
