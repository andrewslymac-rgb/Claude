import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role, User, Workspace } from "@/db/schema";
import { getCurrentUser } from "./auth/session";
import { can, ForbiddenError, type Ability } from "./permissions";

const { workspaces, memberships } = schema;

export type Access = { user: User; workspace: Workspace; role: Role };

/** Workspaces the user can open. App admins see all of them. */
export const listWorkspacesForUser = cache(async (user: User) => {
  if (user.isAppAdmin) {
    const all = await db.select().from(workspaces).orderBy(asc(workspaces.name));
    const mine = await db.select().from(memberships).where(eq(memberships.userId, user.id));
    const roleBy = new Map(mine.map((m) => [m.workspaceId, m.role]));
    return all.map((w) => ({ ...w, role: (roleBy.get(w.id) ?? "owner") as Role }));
  }
  const rows = await db
    .select({ w: workspaces, role: memberships.role })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, user.id))
    .orderBy(asc(workspaces.name));
  return rows.map((r) => ({ ...r.w, role: r.role }));
});

async function resolve(slug: string): Promise<Access | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  if (!ws) return null;
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.workspaceId, ws.id), eq(memberships.userId, user.id)));
  const role: Role | null = m?.role ?? (user.isAppAdmin ? "owner" : null);
  if (!role) return null;
  return { user, workspace: ws, role };
}

/** For pages: redirects to login / 404s instead of throwing. */
export const requireWorkspacePage = cache(async (slug: string) => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = await resolve(slug);
  if (!access) notFound();
  return access;
});

/** For server actions: throws if the user lacks the ability. */
export async function requireAbility(slug: string, ability: Ability): Promise<Access> {
  const access = await resolve(slug);
  if (!access) throw new ForbiddenError("Please sign in again.");
  if (!can(access.role, ability)) throw new ForbiddenError();
  return access;
}
