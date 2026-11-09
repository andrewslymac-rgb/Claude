import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { ForbiddenError, outranks } from "@/lib/permissions";

const { users, memberships, invites, memberRoles, workspaceRoles } = schema;

export async function listMembers(workspaceId: string) {
  const members = await db
    .select({ userId: users.id, email: users.email, name: users.name, avatarUrl: users.avatarUrl, role: memberships.role, lastSeenAt: users.lastSeenAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspaceId))
    .orderBy(asc(users.name));
  const pending = await db.select().from(invites).where(eq(invites.workspaceId, workspaceId)).orderBy(asc(invites.email));
  const held = await db
    .select({ userId: memberRoles.userId, id: workspaceRoles.id, name: workspaceRoles.name, emoji: workspaceRoles.emoji, color: workspaceRoles.color })
    .from(memberRoles)
    .innerJoin(workspaceRoles, eq(workspaceRoles.id, memberRoles.roleId))
    .where(eq(memberRoles.workspaceId, workspaceId));
  const byUser = new Map<string, { id: string; name: string; emoji: string; color: string }[]>();
  for (const h of held) byUser.set(h.userId, [...(byUser.get(h.userId) ?? []), { id: h.id, name: h.name, emoji: h.emoji, color: h.color }]);
  return { members: members.map((m) => ({ ...m, jobRoles: byUser.get(m.userId) ?? [] })), pending };
}

/** Owners can do anything; admins can only manage editors and viewers. */
function assertCanAssign(actorRole: Role, target: Role) {
  if (actorRole !== "owner" && !outranks(actorRole, target)) {
    throw new ForbiddenError("Only an owner can give or change that level of access.");
  }
}

export async function addMember(workspaceId: string, emailRaw: string, role: Role, actorRole: Role, actorId: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That doesn't look like an email address.");
  assertCanAssign(actorRole, role);
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    await db.insert(memberships).values({ workspaceId, userId: existing.id, role }).onConflictDoUpdate({ target: [memberships.workspaceId, memberships.userId], set: { role } });
    return { status: "added" as const };
  }
  await db.insert(invites).values({ workspaceId, email, role, invitedById: actorId }).onConflictDoUpdate({ target: [invites.workspaceId, invites.email], set: { role } });
  return { status: "invited" as const };
}

async function ownerCount(workspaceId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "owner")));
  return n;
}

export async function changeRole(workspaceId: string, userId: string, role: Role, actorRole: Role) {
  const [m] = await db.select().from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  if (!m) throw new Error("Member not found");
  assertCanAssign(actorRole, m.role);
  assertCanAssign(actorRole, role);
  if (m.role === "owner" && role !== "owner" && (await ownerCount(workspaceId)) <= 1) throw new Error("A workspace needs at least one owner.");
  await db.update(memberships).set({ role }).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
}

export async function removeMember(workspaceId: string, userId: string, actorRole: Role) {
  const [m] = await db.select().from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  if (!m) return;
  assertCanAssign(actorRole, m.role);
  if (m.role === "owner" && (await ownerCount(workspaceId)) <= 1) throw new Error("A workspace needs at least one owner.");
  await db.delete(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
}

export async function cancelInvite(workspaceId: string, inviteId: string, actorRole: Role) {
  const [inv] = await db.select().from(invites).where(and(eq(invites.workspaceId, workspaceId), eq(invites.id, inviteId)));
  if (!inv) return;
  assertCanAssign(actorRole, inv.role);
  await db.delete(invites).where(eq(invites.id, inviteId));
}
