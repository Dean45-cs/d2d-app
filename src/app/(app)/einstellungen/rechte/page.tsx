import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listMembers } from "@/lib/queries";
import { canManageMember, permissionOverrides, permissionsFor } from "@/lib/permissions";
import type { PermissionOverrides, PermissionSet } from "@/lib/permission-definitions";
import type { User } from "@/lib/types";
import { PageHeader, plural } from "@/components/ui";
import { PermissionEditor } from "./PermissionEditor";

export const dynamic = "force-dynamic";

/**
 * Rechte je Person: links die Personen, die man verwalten darf, rechts
 * (auf dem Handy nach dem Antippen) jedes Recht mit Standard / An / Aus.
 * ?person=<id> oeffnet direkt eine Person.
 */
export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  const user = await requireUser();
  const rights = permissionsFor(user);
  if (!rights["permissions.manage"]) redirect("/profil");
  const { person } = await searchParams;

  const members = listMembers(user.team_id)
    .filter((member) => member.id !== user.id && canManageMember(user, member))
    .map((member) => {
      const overrides = permissionOverrides(member.id);
      return {
        id: member.id,
        name: member.name,
        avatar: member.avatar,
        role: member.role,
        active: member.active,
        effective: permissionsFor(member, overrides),
        overrides,
        standard: standardRights(member, overrides),
      };
    });
  const selected = members.some((member) => String(member.id) === person) ? Number(person) : null;

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/profil", label: "Profil" }}
        title="Rechte"
        subtitle={members.length > 0 ? plural(members.length, "Person", "Personen") : undefined}
      />
      <PermissionEditor
        members={members}
        selectedId={selected}
        grantable={{ ...rights, "team.roles": user.role === "LEADER" && rights["team.roles"] }}
      />
    </div>
  );
}

/**
 * Was "Standard" je Recht bedeutet: das Ergebnis ohne eigene Abweichung.
 * Die Gebietsrechte haengen am Erstellrecht - dessen Abweichung zaehlt dort
 * mit. Deaktivierte Personen werden wie aktive gerechnet, sonst stuende
 * ueberall "nicht erlaubt".
 */
function standardRights(member: User, overrides: PermissionOverrides): PermissionSet {
  const person = { ...member, active: 1 };
  const base = permissionsFor(person, {});
  const create = overrides["territories.create"];
  const chained = create === undefined ? base : permissionsFor(person, { "territories.create": create });
  return { ...chained, "territories.create": base["territories.create"] };
}
