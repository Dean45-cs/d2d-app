import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listMembers } from "@/lib/queries";
import { canManageMember, permissionOverrides, permissionsFor } from "@/lib/permissions";
import { PermissionEditor } from "./PermissionEditor";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const user = await requireUser();
  const rights = permissionsFor(user);
  if (!rights["permissions.manage"]) redirect("/tour");
  const members = listMembers(user.team_id).filter((member) => member.id !== user.id && canManageMember(user, member));
  return <PermissionEditor
    members={members.map((member) => ({ id: member.id, name: member.name, role: member.role, active: member.active,
      effective: permissionsFor(member), overrides: permissionOverrides(member.id) }))}
    grantable={{ ...rights, "team.roles": user.role === "LEADER" && rights["team.roles"] }} />;
}
