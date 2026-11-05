import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { flags, pages, users } = schema;

import type { FlagSeverity, FlagStatus, FlagType } from "@/lib/flag-labels";

export type FlagInput = {
  title: string;
  type: FlagType;
  severity: FlagSeverity;
  status?: FlagStatus;
  whoDecides?: string | null;
  whatWeFound?: string;
  nextStep?: string;
  pageId?: string | null;
  ownerId?: string | null;
};

export async function listFlags(workspaceId: string) {
  return db
    .select({
      id: flags.id,
      title: flags.title,
      type: flags.type,
      severity: flags.severity,
      status: flags.status,
      whoDecides: flags.whoDecides,
      whatWeFound: flags.whatWeFound,
      nextStep: flags.nextStep,
      pageId: flags.pageId,
      pageTitle: pages.title,
      pageIcon: pages.icon,
      ownerId: flags.ownerId,
      ownerName: users.name,
      foundAt: flags.foundAt,
      resolvedAt: flags.resolvedAt,
    })
    .from(flags)
    .leftJoin(pages, eq(pages.id, flags.pageId))
    .leftJoin(users, eq(users.id, flags.ownerId))
    .where(eq(flags.workspaceId, workspaceId))
    .orderBy(asc(flags.status), desc(flags.severity), desc(flags.foundAt));
}

export async function createFlag(workspaceId: string, input: FlagInput, createdById: string) {
  const [f] = await db.insert(flags).values({ workspaceId, ...input, title: input.title.trim(), createdById }).returning();
  return f;
}

export async function updateFlag(workspaceId: string, id: string, patch: Partial<FlagInput>) {
  const resolved = patch.status === "resolved" || patch.status === "wont_fix";
  await db
    .update(flags)
    .set({ ...patch, ...(patch.status ? { resolvedAt: resolved ? new Date() : null } : {}) })
    .where(and(eq(flags.workspaceId, workspaceId), eq(flags.id, id)));
}

export async function deleteFlag(workspaceId: string, id: string) {
  await db.delete(flags).where(and(eq(flags.workspaceId, workspaceId), eq(flags.id, id)));
}

