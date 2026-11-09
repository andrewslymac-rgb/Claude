import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { RolePermission } from "@/db/schema";

const { workspaceRoles, memberRoles, users, tasks } = schema;

export type RoleInput = { name: string; emoji?: string; color?: string; description?: string; permissions?: RolePermission[] };

export async function listRoles(workspaceId: string) {
  const roles = await db.select().from(workspaceRoles).where(eq(workspaceRoles.workspaceId, workspaceId)).orderBy(asc(workspaceRoles.position), asc(workspaceRoles.name));
  if (!roles.length) return [];
  const holders = await db
    .select({ roleId: memberRoles.roleId, id: users.id, name: users.name, email: users.email })
    .from(memberRoles)
    .innerJoin(users, eq(users.id, memberRoles.userId))
    .where(inArray(memberRoles.roleId, roles.map((r) => r.id)));
  const counts = await db.select({ roleId: tasks.roleId, n: sql<number>`count(*)::int` }).from(tasks).where(and(eq(tasks.workspaceId, workspaceId), sql`${tasks.archivedAt} is null`)).groupBy(tasks.roleId);
  const byRole = new Map<string, { id: string; name: string }[]>();
  for (const h of holders) byRole.set(h.roleId, [...(byRole.get(h.roleId) ?? []), { id: h.id, name: h.name ?? h.email }]);
  const taskCount = new Map(counts.filter((c) => c.roleId).map((c) => [c.roleId!, c.n]));
  return roles.map((r) => ({ ...r, members: byRole.get(r.id) ?? [], taskCount: taskCount.get(r.id) ?? 0 }));
}

export async function createRole(workspaceId: string, input: RoleInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Give the role a name.");
  const [{ top }] = await db.select({ top: sql<number>`coalesce(max(position), 0)` }).from(workspaceRoles).where(eq(workspaceRoles.workspaceId, workspaceId));
  const [r] = await db
    .insert(workspaceRoles)
    .values({ workspaceId, name, emoji: input.emoji || "🧑‍💼", color: input.color || "#6366f1", description: input.description ?? "", permissions: input.permissions ?? [], position: Number(top) + 1 })
    .onConflictDoNothing()
    .returning();
  if (!r) throw new Error(`A role called "${name}" already exists.`);
  return r;
}

export async function updateRole(workspaceId: string, id: string, input: Partial<RoleInput>) {
  const [r] = await db
    .update(workspaceRoles)
    .set({ ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.emoji !== undefined ? { emoji: input.emoji || "🧑‍💼" } : {}), ...(input.color !== undefined ? { color: input.color } : {}), ...(input.description !== undefined ? { description: input.description } : {}), ...(input.permissions !== undefined ? { permissions: input.permissions } : {}) })
    .where(and(eq(workspaceRoles.workspaceId, workspaceId), eq(workspaceRoles.id, id)))
    .returning();
  if (!r) throw new Error("Role not found.");
  return r;
}

/** Deleting a role un-assigns its tasks (they become "anyone") and drops it from people. */
export async function deleteRole(workspaceId: string, id: string) {
  await db.delete(workspaceRoles).where(and(eq(workspaceRoles.workspaceId, workspaceId), eq(workspaceRoles.id, id)));
}

export async function setRoleMembers(workspaceId: string, roleId: string, userIds: string[]) {
  await db.delete(memberRoles).where(and(eq(memberRoles.workspaceId, workspaceId), eq(memberRoles.roleId, roleId)));
  if (userIds.length) await db.insert(memberRoles).values(userIds.map((userId) => ({ workspaceId, roleId, userId }))).onConflictDoNothing();
}

export async function setMemberRoles(workspaceId: string, userId: string, roleIds: string[]) {
  await db.delete(memberRoles).where(and(eq(memberRoles.workspaceId, workspaceId), eq(memberRoles.userId, userId)));
  if (roleIds.length) await db.insert(memberRoles).values(roleIds.map((roleId) => ({ workspaceId, roleId, userId }))).onConflictDoNothing();
}

/** Find a role by name (case-insensitive), or create it. Used by imports and the AI tools. */
export async function roleByName(workspaceId: string, name: string, create = false) {
  const q = name.trim();
  if (!q) return null;
  const [r] = await db.select().from(workspaceRoles).where(and(eq(workspaceRoles.workspaceId, workspaceId), sql`lower(${workspaceRoles.name}) = lower(${q})`));
  if (r || !create) return r ?? null;
  return createRole(workspaceId, { name: q });
}
