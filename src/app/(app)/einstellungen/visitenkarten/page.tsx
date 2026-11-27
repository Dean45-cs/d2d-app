import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { teamCards } from "@/lib/card-queries";
import { canManageMember, permissionsFor } from "@/lib/permissions";
import { listMembers } from "@/lib/queries";
import { TeamCards } from "./TeamCards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Visitenkarten" };

/**
 * Die Visitenkarten des Teams auf einen Blick: Link und QR-Code je Person,
 * zum Drucken auf Ausweise oder zum Weitergeben. Sichtbar ist, wen man auch
 * unter Mitglieder verwalten darf - und man selbst.
 */
export default async function TeamCardsPage() {
  const user = await requireUser();
  if (!permissionsFor(user)["team.manage"]) redirect("/profil");
  const ids = listMembers(user.team_id)
    .filter((member) => member.id === user.id || canManageMember(user, member))
    .map((member) => member.id);
  return <TeamCards cards={teamCards(user.team_id, ids)} />;
}
