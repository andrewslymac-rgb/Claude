import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FeedbackKind, FeedbackStatus } from "@/db/schema";

const { feedback, users } = schema;

export async function listFeedback(workspaceId: string) {
  return db
    .select({ id: feedback.id, kind: feedback.kind, body: feedback.body, pagePath: feedback.pagePath, status: feedback.status, response: feedback.response, createdAt: feedback.createdAt, updatedAt: feedback.updatedAt, userId: feedback.userId, by: users.name, byEmail: users.email })
    .from(feedback)
    .leftJoin(users, eq(users.id, feedback.userId))
    .where(eq(feedback.workspaceId, workspaceId))
    .orderBy(desc(feedback.createdAt));
}

export async function createFeedback(workspaceId: string, userId: string | null, input: { kind: FeedbackKind; body: string; pagePath?: string | null }) {
  const body = input.body.trim();
  if (!body) throw new Error("Write something first.");
  const [f] = await db.insert(feedback).values({ workspaceId, userId, kind: input.kind, body, pagePath: input.pagePath ?? null }).returning();
  return f;
}

export async function updateFeedback(workspaceId: string, id: string, patch: { status?: FeedbackStatus; response?: string | null }) {
  const [f] = await db
    .update(feedback)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(feedback.workspaceId, workspaceId), eq(feedback.id, id)))
    .returning();
  if (!f) throw new Error("Not found.");
  return f;
}

export async function deleteFeedback(workspaceId: string, id: string) {
  await db.delete(feedback).where(and(eq(feedback.workspaceId, workspaceId), eq(feedback.id, id)));
}
