import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { addWidget } from "./dashboard";

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
  for (const t of ["welcome", "links", "sops", "recent"] as const) await addWidget(ws.id, t);
  return ws;
}

export async function updateWorkspace(id: string, patch: { name?: string; icon?: string; color?: string }) {
  await db.update(workspaces).set(patch).where(eq(workspaces.id, id));
}
