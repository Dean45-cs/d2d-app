import { requireUser } from "@/lib/auth";
import { invitationDashboard } from "@/lib/invitations";
import { Invitations } from "./Invitations";

export const dynamic = "force-dynamic";

export default async function InvitationsPage() {
  const user = await requireUser();
  return (
    <div className="page">
      {/* An der Strukturspitze gibt die Teamleitung ihre Einladungen selbst frei. */}
      <Invitations {...invitationDashboard(user)} selfApproves={user.manager_id === null && user.role === "LEADER"} />
    </div>
  );
}
