import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FieldTool } from "@/db/schema";
import { setupCommandCenter } from "./dashboard";

const { workspaces, memberships } = schema;

export function slugify(name: string) {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
}

export async function createWorkspace(input: { name: string; icon?: string; color?: string }, ownerId: string) {
  const base = slugify(input.name);
  let slug = base;
  for (let i = 2; (await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug))).length; i++) slug = `${base}-${i}`;
  const [ws] = await db.insert(workspaces).values({ name: input.name.trim(), slug, icon: input.icon || "🏢", color: input.color || "#6366f1" }).returning();
  await db.insert(memberships).values({ workspaceId: ws.id, userId: ownerId, role: "owner" });
  await setupCommandCenter(ws.id, null); // new companies start with the full command center
  return ws;
}

export async function updateWorkspace(id: string, patch: { name?: string; icon?: string; color?: string; fieldTool?: FieldTool }) {
  await db.update(workspaces).set(patch).where(eq(workspaces.id, id));
}

/** A workspace by slug, only if this user can manage its dashboard (member admin/owner, or app admin). */
export async function workspaceForUserBySlug(userId: string, slug: string) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  if (!ws) return null;
  const [u] = await db.select({ isAppAdmin: schema.users.isAppAdmin }).from(schema.users).where(eq(schema.users.id, userId));
  if (u?.isAppAdmin) return ws;
  const [m] = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.workspaceId, ws.id), eq(memberships.userId, userId)));
  return m && (m.role === "owner" || m.role === "admin") ? ws : null;
}

/**
 * A company this person can open, found by slug or by name (case-insensitive).
 * level "member": any role, for reading. "admin": owner/admin, for changing things.
 * App admins can open every company.
 */
export async function workspaceForUser(userId: string, slugOrName: string, level: "member" | "admin") {
  const q = slugOrName.trim().toLowerCase();
  const all = await db.select().from(workspaces);
  const ws = all.find((w) => w.slug === q) ?? all.find((w) => w.name.toLowerCase() === q) ?? all.find((w) => w.name.toLowerCase().startsWith(q));
  if (!ws) return null;
  const [u] = await db.select({ isAppAdmin: schema.users.isAppAdmin }).from(schema.users).where(eq(schema.users.id, userId));
  if (u?.isAppAdmin) return ws;
  const [m] = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.workspaceId, ws.id), eq(memberships.userId, userId)));
  if (!m) return null;
  return level === "member" || m.role === "owner" || m.role === "admin" ? ws : null;
}

/** Every company this person can open. */
export async function workspacesForUserId(userId: string) {
  const [u] = await db.select({ isAppAdmin: schema.users.isAppAdmin }).from(schema.users).where(eq(schema.users.id, userId));
  if (u?.isAppAdmin) return db.select().from(workspaces);
  const rows = await db.select({ w: workspaces, role: memberships.role }).from(memberships).innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId)).where(eq(memberships.userId, userId));
  return rows.map((r) => ({ ...r.w, role: r.role }));
}
