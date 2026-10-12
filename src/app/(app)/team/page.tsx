import { canManageMember, permissionsFor } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listMembers, listTerritories, memberStats } from "@/lib/queries";
import { TeamTable } from "./TeamTable";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireUser();
  const rights = permissionsFor(user);
  if (!rights["team.manage"] && !rights["structure.manage"] && !rights["team.roles"]) redirect("/tour");

  const members = listMembers(user.team_id).filter((member) => member.id === user.id || canManageMember(user, member));
  const stats = rights["reports.team"] ? memberStats(user.team_id) : [];
  const territories = listTerritories(user.team_id);

  const rows = members.map((m) => {
    const s = stats.find((x) => x.user_id === m.id);
    return {
      ...m,
      doors: s?.doors ?? 0,
      met: s?.met ?? 0,
      sales: s?.sales ?? 0,
      territories: territories
        .filter((t) => t.assigned_user_id === m.id && t.status !== "DONE")
        .map((t) => t.name),
    };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <TeamTable rows={rows} currentUserId={user.id} rights={{ ...rights, "team.roles": user.role === "LEADER" && rights["team.roles"] }} editableIds={members.filter((member) => canManageMember(user, member)).map((member) => member.id)} />
    </div>
  );
}
