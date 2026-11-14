import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Workspace } from "@/db/schema";
import { cached } from "./cache";
import { pullUnpaidInvoices, type ArPull } from "@/lib/integrations/jobber-ar";
import { getIntegration, MANUAL_TOKEN } from "@/lib/integrations/jobber";

const { arFollowups, users, dataCache } = schema;
const TTL = 10 * 60_000;

export type ArBoard = { pull: ArPull | null; fetchedAt: string | null; error: string | null; stale: boolean; connected: boolean };

/** Unpaid invoices for one company, cached 10 minutes. On a Jobber error, falls back to the last good pull and says so. */
export async function arBoard(ws: Workspace, force = false): Promise<ArBoard> {
  const row = await getIntegration(ws.id, "jobber");
  if (!row || row.accessToken === MANUAL_TOKEN) return { pull: null, fetchedAt: null, error: null, stale: false, connected: false };
  try {
    const r = await cached(ws.id, "ar:v1", TTL, () => pullUnpaidInvoices(ws.id), force);
    return { pull: r.data, fetchedAt: r.fetchedAt, error: null, stale: false, connected: true };
  } catch (e) {
    const [old] = await db.select().from(dataCache).where(and(eq(dataCache.workspaceId, ws.id), eq(dataCache.key, "ar:v1")));
    return { pull: (old?.payload as ArPull) ?? null, fetchedAt: old?.fetchedAt.toISOString() ?? null, error: (e as Error).message.slice(0, 300), stale: Boolean(old), connected: true };
  }
}

export type FollowupView = { id: string; invoiceId: string; note: string; followUpOn: string | null; by: string; at: string };

export async function listFollowups(workspaceId: string): Promise<FollowupView[]> {
  const rows = await db
    .select({ f: arFollowups, name: users.name, email: users.email })
    .from(arFollowups)
    .leftJoin(users, eq(users.id, arFollowups.createdById))
    .where(eq(arFollowups.workspaceId, workspaceId))
    .orderBy(desc(arFollowups.createdAt));
  return rows.map((r) => ({ id: r.f.id, invoiceId: r.f.invoiceId, note: r.f.note, followUpOn: r.f.followUpOn, by: r.name || r.email?.split("@")[0] || "Someone", at: r.f.createdAt.toISOString() }));
}

export async function addFollowup(workspaceId: string, invoiceId: string, note: string, followUpOn: string | null, userId: string) {
  await db.insert(arFollowups).values({ workspaceId, invoiceId, note, followUpOn, createdById: userId });
}

export async function deleteFollowup(workspaceId: string, id: string) {
  await db.delete(arFollowups).where(and(eq(arFollowups.workspaceId, workspaceId), eq(arFollowups.id, id)));
}
