import { requireUser } from "@/lib/auth";
import { invitationDashboard } from "@/lib/invitations";
import { Invitations } from "./Invitations";

export const dynamic = "force-dynamic";

export default async function InvitationsPage() {
  const user = await requireUser();
  return <Invitations {...invitationDashboard(user)} />;
}
