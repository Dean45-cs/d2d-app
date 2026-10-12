import { AuthError, requireUser } from "./auth";
import { getDb } from "./db";
import { PERMISSIONS, isPermission, type Permission, type PermissionOverrides, type PermissionSet } from "./permission-definitions";
import type { Territory, User } from "./types";

export function structureIds(user: User): number[] {
  return (getDb().prepare(`WITH RECURSIVE descendants(id) AS (
    SELECT id FROM users WHERE manager_id = ? AND team_id = ?
    UNION SELECT u.id FROM users u JOIN descendants d ON u.manager_id = d.id WHERE u.team_id = ?
  ) SELECT id FROM descendants WHERE id <> ?`).all(user.id, user.team_id, user.team_id, user.id) as { id: number }[]).map((row) => row.id);
}

export function permissionOverrides(userId: number): PermissionOverrides {
  const rows = getDb().prepare("SELECT permission, allowed FROM user_permissions WHERE user_id = ?").all(userId) as { permission: string; allowed: number }[];
  return Object.fromEntries(rows.filter((row) => isPermission(row.permission)).map((row) => [row.permission, Boolean(row.allowed)]));
}

export function permissionsFor(user: User, overrides = permissionOverrides(user.id)): PermissionSet {
  const ids = structureIds(user);
  const hasPeople = ids.length > 0 && Boolean(getDb().prepare(`SELECT 1 FROM users WHERE active = 1 AND id IN (${ids.map(() => "?").join(",")}) LIMIT 1`).get(...ids));
  const defaults = Object.fromEntries(PERMISSIONS.map(({ key }) => [key, user.role === "LEADER"])) as PermissionSet;
  defaults["territories.create"] ||= hasPeople;
  defaults["permissions.manage"] ||= hasPeople;
  defaults["invitations.create"] = true;
  defaults["invitations.approve"] = true;
  const canCreate = overrides["territories.create"] ?? defaults["territories.create"];
  for (const key of ["territories.edit", "territories.assign", "territories.delete"] as const) defaults[key] ||= canCreate;
  const result = { ...defaults, ...overrides };
  // Promoting someone to LEADER grants role defaults, so this power remains
  // restricted to actual team leaders even when an override is stored.
  if (user.role !== "LEADER") result["team.roles"] = false;
  if (!user.active) for (const { key } of PERMISSIONS) result[key] = false;
  return result;
}

export function hasPermission(user: User, permission: Permission): boolean {
  return permissionsFor(user)[permission];
}

export function assertPermission(user: User, permission: Permission): void {
  if (!hasPermission(user, permission)) {
    const label = PERMISSIONS.find((item) => item.key === permission)!.label;
    throw new AuthError(`Keine Berechtigung: ${label}.`, 403);
  }
}

export async function requirePermission(permission: Permission): Promise<User> {
  const user = await requireUser();
  assertPermission(user, permission);
  return user;
}

export function canAccessTerritory(user: User, territory: Pick<Territory, "team_id" | "assigned_user_id" | "created_by">, rights = permissionsFor(user)): boolean {
  return Boolean(user.active && territory.team_id === user.team_id && (
    rights["territories.view_all"] || territory.assigned_user_id === user.id || territory.created_by === user.id
  ));
}

export function assertTerritoryAccess(user: User, territory: Pick<Territory, "team_id" | "assigned_user_id" | "created_by">): void {
  if (!canAccessTerritory(user, territory)) throw new AuthError("Dieses Gebiet ist für dich nicht freigegeben.", 403);
}

export function assertStreetAccess(user: User, streetId: number): void {
  const territory = getDb().prepare("SELECT t.* FROM territories t JOIN streets s ON s.territory_id = t.id WHERE s.id = ? AND t.team_id = ?").get(streetId, user.team_id) as Territory | undefined;
  if (!territory) throw new Error("Straße nicht gefunden.");
  assertTerritoryAccess(user, territory);
}

/** Every assignee, including single-territory creation, is checked on the server. */
export function territoryAssignee(user: User, value: unknown, creating = false): number | null {
  const id = value === null || value === undefined || value === "" ? null : Number(value);
  if (id !== null && (!Number.isSafeInteger(id) || id < 1)) throw new Error("Ungültiger Mitarbeiter.");
  if (!hasPermission(user, "territories.assign")) {
    if (!creating || (id !== null && id !== user.id)) assertPermission(user, "territories.assign");
    return user.id;
  }
  if (id === null) return null;
  const target = getDb().prepare("SELECT id FROM users WHERE id = ? AND team_id = ? AND active = 1").get(id, user.team_id);
  if (!target) throw new Error("Mitarbeiter gehört nicht zum aktiven Team.");
  if (!hasPermission(user, "territories.view_all") && id !== user.id && !structureIds(user).includes(id)) {
    throw new AuthError("Du kannst Gebiete nur an deine eigene Struktur zuteilen.", 403);
  }
  return id;
}

export function canManageMember(user: User, target: User): boolean {
  return Boolean(user.active && target.team_id === user.team_id && (user.role === "LEADER" || (
    target.role !== "LEADER" && target.id !== user.id && structureIds(user).includes(target.id)
  )));
}

export function assertMemberScope(user: User, target: User): void {
  if (!canManageMember(user, target)) throw new AuthError("Diese Person gehört nicht zu deiner verwaltbaren Struktur.", 403);
}

/** Validate the whole patch before writing; no partial grants on invalid input. */
export function updatePermissions(actor: User, targetId: number, patch: unknown): void {
  assertPermission(actor, "permissions.manage");
  const target = getDb().prepare("SELECT * FROM users WHERE id = ? AND team_id = ?").get(targetId, actor.team_id) as User | undefined;
  if (!target) throw new Error("Mitglied nicht gefunden.");
  if (target.id === actor.id) throw new AuthError("Eigene Berechtigungen können nur andere Verantwortliche ändern.", 403);
  assertMemberScope(actor, target);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Ungültige Berechtigungen.");
  const entries = Object.entries(patch);
  const rights = permissionsFor(actor);
  for (const [key, value] of entries) {
    if (!isPermission(key) || (value !== null && typeof value !== "boolean")) throw new Error("Ungültige Berechtigung.");
    if (!rights[key] || (key === "team.roles" && actor.role !== "LEADER")) throw new AuthError("Du kannst nur eigene Berechtigungen vergeben oder ändern.", 403);
  }
  const overrides = permissionOverrides(targetId);
  const before = permissionsFor(target, overrides);
  for (const [key, value] of entries) {
    if (value === null) delete overrides[key as Permission];
    else overrides[key as Permission] = value;
  }
  const after = permissionsFor(target, overrides);
  if (PERMISSIONS.some(({ key }) => after[key] && !before[key] && !rights[key])) {
    throw new AuthError("Diese Änderung würde zusätzliche Rechte vergeben, die du selbst nicht besitzt.", 403);
  }
  const db = getDb();
  db.transaction(() => {
    for (const [key, value] of entries) {
      if (value === null) db.prepare("DELETE FROM user_permissions WHERE user_id = ? AND permission = ?").run(targetId, key);
      else db.prepare(`INSERT INTO user_permissions(user_id, permission, allowed, granted_by) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, permission) DO UPDATE SET allowed = excluded.allowed, granted_by = excluded.granted_by, updated_at = datetime('now')`)
        .run(targetId, key, value ? 1 : 0, actor.id);
    }
  })();
}
