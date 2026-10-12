import { hasPermission } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { listAppointments, listMembers } from "@/lib/queries";
import { PushToggle } from "@/components/community/PushToggle";
import { AppointmentList } from "./AppointmentList";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const user = await requireUser();
  const isLeader = hasPermission(user, "appointments.team");

  // Die Teamleitung sieht das ganze Team, der Aussendienst seine eigenen
  // Termine - dieselbe Trennung wie überall sonst in der App.
  const scope = isLeader ? {} : { userId: user.id };

  // Gesichter nur, wo mehrere Leute in der Liste stehen.
  const faces: Record<number, string> = isLeader
    ? Object.fromEntries(listMembers(user.team_id).map((m) => [m.id, m.avatar]))
    : {};

  return (
    <div className="mx-auto max-w-3xl">
      <section className="card mb-4 p-4">
        <h2 className="font-semibold">Terminerinnerungen</h2>
        <p className="muted mb-2 text-[13px]">Mit Push erhältst du etwa 15 Minuten vor deinen offenen Terminen eine Erinnerung. Ein Tipp öffnet den Termin mit Anruf und Route.</p>
        <PushToggle description="Terminerinnerungen und Neuigkeiten aus dem Team auf diesem Gerät." />
      </section>
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
