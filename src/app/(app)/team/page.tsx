import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listMembers, listTerritories, memberStats } from "@/lib/queries";
import { TeamTable } from "./TeamTable";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireUser();
  if (user.role !== "LEADER") redirect("/tour");

  const members = listMembers(user.team_id);
  const stats = memberStats(user.team_id);
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
    <div className="mx-auto max-w-4xl">
      <TeamTable rows={rows} currentUserId={user.id} />
    </div>
  );
}
