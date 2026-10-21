import type { Metadata } from "next";
import { canAccessTerritory, canManageMember, permissionsFor } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listMembers, listTerritories, memberStats } from "@/lib/queries";
import { TeamTable } from "./TeamTable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mitglieder" };

/**
 * Mitglieder verwalten: Liste (Handy) bzw. Tabelle (Rechner) und die
 * Struktur als eingerueckter Baum. Alles Bearbeiten passiert im Blatt.
 */
export default async function MembersPage() {
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
        // Verlinkt wird nur, was die Leitung selbst oeffnen darf.
        .map((t) => ({ id: t.id, name: t.name, open: canAccessTerritory(user, t, rights) })),
    };
  });

  return (
    <div className="page">
      <TeamTable
        rows={rows}
        currentUserId={user.id}
        rights={{ ...rights, "team.roles": user.role === "LEADER" && rights["team.roles"] }}
        editableIds={members.filter((member) => canManageMember(user, member)).map((member) => member.id)}
      />
    </div>
  );
}
