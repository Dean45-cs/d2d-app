import { hasPermission } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { countAppointments, listAppointments, listMembers } from "@/lib/queries";
import { AppointmentList } from "./AppointmentList";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const user = await requireUser();
  const isLeader = hasPermission(user, "appointments.team");
  // Offene und erledigte getrennt: jede Liste hat ihr eigenes Limit.
  const scope = isLeader ? {} : { userId: user.id };
  // Gesichter nur, wo mehrere Leute in der Liste stehen.
  const faces: Record<number, string> = isLeader
    ? Object.fromEntries(listMembers(user.team_id).map((m) => [m.id, m.avatar]))
    : {};

  return (
    <AppointmentList
      appointments={[
        ...listAppointments(user.team_id, { ...scope, limit: 300 }),
        ...listAppointments(user.team_id, { ...scope, done: true, limit: 100 }),
      ]}
      counts={countAppointments(user.team_id, scope)}
      isLeader={isLeader}
      faces={faces}
      back={
        hasPermission(user, "reports.team")
          ? { href: "/start", label: "Übersicht" }
          : { href: "/tour", label: "Klinken" }
      }
    />
  );
}
