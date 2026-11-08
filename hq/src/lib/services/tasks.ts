import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Frequency } from "@/db/schema";
import { addDays, computeNextDue, dueState, nextDueAfter, todayISO, type DueState } from "@/lib/recurrence";

const { tasks, taskAssignees, taskCompletions, users, pages } = schema;

export type TaskRow = {
  id: string;
  title: string;
  category: string | null;
  frequency: Frequency;
  whenText: string | null;
  instructions: string;
  ownerRole: string | null;
  sopPageId: string | null;
  sopTitle: string | null;
  dueOn: string | null;
  lastDoneOn: string | null;
  nextDueOn: string | null;
  dueOverride: string | null;
  state: DueState;
  assignees: { id: string; name: string }[];
  /** True if the latest completion can be undone (done within the last 7 days). */
  canUndo: boolean;
};

export async function listTasks(workspaceId: string): Promise<TaskRow[]> {
  const rows = await db
    .select({ t: tasks, sopTitle: pages.title })
    .from(tasks)
    .leftJoin(pages, eq(pages.id, tasks.sopPageId))
    .where(and(eq(tasks.workspaceId, workspaceId), isNull(tasks.archivedAt)))
    .orderBy(asc(tasks.nextDueOn), asc(tasks.title));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.t.id);
  const assignees = await db
    .select({ taskId: taskAssignees.taskId, id: users.id, name: users.name, email: users.email })
    .from(taskAssignees)
    .innerJoin(users, eq(users.id, taskAssignees.userId))
    .where(inArray(taskAssignees.taskId, ids));
  const byTask = new Map<string, { id: string; name: string }[]>();
  for (const a of assignees) byTask.set(a.taskId, [...(byTask.get(a.taskId) ?? []), { id: a.id, name: a.name ?? a.email }]);
  const today = todayISO();
  const undoCutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  return rows.map(({ t, sopTitle }) => ({
    id: t.id,
    title: t.title,
    category: t.category,
    frequency: t.frequency,
    whenText: t.whenText,
    instructions: t.instructions,
    ownerRole: t.ownerRole,
    sopPageId: t.sopPageId,
    sopTitle: sopTitle ?? null,
    dueOn: t.dueOn,
    lastDoneOn: t.lastDoneOn,
    nextDueOn: t.nextDueOn,
    dueOverride: t.dueOverride,
    state: dueState(t.nextDueOn, today),
    assignees: byTask.get(t.id) ?? [],
    canUndo: Boolean(t.lastDoneOn && t.lastDoneOn >= undoCutoff),
  }));
}

/** Tasks relevant to one person: assigned to them, or unassigned (anyone can do them). */
export function tasksForUser(all: TaskRow[], userId: string) {
  return all.filter((t) => t.assignees.length === 0 || t.assignees.some((a) => a.id === userId));
}

export type TaskInput = {
  title: string;
  category?: string | null;
  frequency: Frequency;
  whenText?: string | null;
  instructions?: string;
  ownerRole?: string | null;
  sopPageId?: string | null;
  dueOn?: string | null;
  assigneeIds?: string[];
};

export async function createTask(workspaceId: string, input: TaskInput, createdById: string) {
  const [t] = await db
    .insert(tasks)
    .values({
      workspaceId,
      title: input.title.trim(),
      category: input.category ?? null,
      frequency: input.frequency,
      whenText: input.whenText ?? null,
      instructions: input.instructions ?? "",
      ownerRole: input.ownerRole ?? null,
      sopPageId: input.sopPageId ?? null,
      dueOn: input.dueOn ?? null,
      nextDueOn: computeNextDue(input.frequency, input.dueOn ?? null, null),
      createdById,
    })
    .returning();
  if (input.assigneeIds?.length) await db.insert(taskAssignees).values(input.assigneeIds.map((userId) => ({ taskId: t.id, userId })));
  return t;
}

export async function updateTask(workspaceId: string, id: string, input: Partial<TaskInput>) {
  const [t] = await db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)));
  if (!t) throw new Error("Task not found");
  const frequency = input.frequency ?? t.frequency;
  const dueOn = input.dueOn === undefined ? t.dueOn : input.dueOn;
  await db
    .update(tasks)
    .set({
      title: input.title?.trim() ?? t.title,
      category: input.category === undefined ? t.category : input.category,
      frequency,
      whenText: input.whenText === undefined ? t.whenText : input.whenText,
      instructions: input.instructions ?? t.instructions,
      ownerRole: input.ownerRole === undefined ? t.ownerRole : input.ownerRole,
      sopPageId: input.sopPageId === undefined ? t.sopPageId : input.sopPageId,
      dueOn,
      nextDueOn: computeNextDue(frequency, dueOn, t.lastDoneOn, undefined, t.dueOverride),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id));
  if (input.assigneeIds) {
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, id));
    if (input.assigneeIds.length) await db.insert(taskAssignees).values(input.assigneeIds.map((userId) => ({ taskId: id, userId })));
  }
}

/** Push the next due date without marking anything done: to a given date, or one period out. */
export async function moveDue(workspaceId: string, id: string, to?: string) {
  const [t] = await db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)));
  if (!t) throw new Error("Task not found");
  const base = t.nextDueOn ?? todayISO();
  const target = to ?? (t.frequency === "once" ? addDays(base, 7) : nextDueAfter(t.frequency, base < todayISO() ? todayISO() : base));
  await db.update(tasks).set({ dueOverride: target, nextDueOn: target, updatedAt: new Date() }).where(eq(tasks.id, id));
  return target;
}

export async function archiveTask(workspaceId: string, id: string) {
  await db.update(tasks).set({ archivedAt: new Date() }).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)));
}

/** Mark done today (or on a given date). Keeps every completion. */
export async function completeTask(workspaceId: string, id: string, userId: string, doneOn = todayISO(), note?: string) {
  const [t] = await db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)));
  if (!t) throw new Error("Task not found");
  // Same day twice = one completion.
  const [existing] = await db.select().from(taskCompletions).where(and(eq(taskCompletions.taskId, id), eq(taskCompletions.doneOn, doneOn)));
  if (!existing) await db.insert(taskCompletions).values({ taskId: id, doneOn, doneById: userId, note });
  await db.update(tasks).set({ dueOverride: null }).where(eq(tasks.id, id));
  await recompute(t.id);
}

/** Remove the most recent completion. */
export async function undoComplete(workspaceId: string, id: string) {
  const [t] = await db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id)));
  if (!t) throw new Error("Task not found");
  const [latest] = await db.select().from(taskCompletions).where(eq(taskCompletions.taskId, id)).orderBy(desc(taskCompletions.doneOn), desc(taskCompletions.createdAt)).limit(1);
  if (latest) await db.delete(taskCompletions).where(eq(taskCompletions.id, latest.id));
  await recompute(t.id);
}

async function recompute(taskId: string) {
  const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const [{ last }] = await db.select({ last: sql<string | null>`max(${taskCompletions.doneOn})` }).from(taskCompletions).where(eq(taskCompletions.taskId, taskId));
  await db.update(tasks).set({ lastDoneOn: last, nextDueOn: computeNextDue(t.frequency, t.dueOn, last, undefined, t.dueOverride), updatedAt: new Date() }).where(eq(tasks.id, taskId));
}

export async function listCompletions(workspaceId: string, taskId: string, limit = 30) {
  const [t] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId)));
  if (!t) return [];
  return db
    .select({ id: taskCompletions.id, doneOn: taskCompletions.doneOn, note: taskCompletions.note, by: users.name })
    .from(taskCompletions)
    .leftJoin(users, eq(users.id, taskCompletions.doneById))
    .where(eq(taskCompletions.taskId, taskId))
    .orderBy(desc(taskCompletions.doneOn))
    .limit(limit);
}

/** Bulk insert used by the Notion import and seed. Skips titles that already exist. */
export async function importTasks(workspaceId: string, items: TaskInput[], createdById: string) {
  const existing = new Set((await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.workspaceId, workspaceId))).map((r) => r.title.toLowerCase()));
  let n = 0;
  for (const it of items) {
    if (existing.has(it.title.trim().toLowerCase())) continue;
    await createTask(workspaceId, it, createdById);
    n++;
  }
  return n;
}

/** Resolve people by name or email (case-insensitive, first name is enough if unique) to user ids. */
export async function resolveAssignees(workspaceId: string, names: string[]): Promise<{ ids: string[]; unknown: string[] }> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(schema.memberships)
    .innerJoin(users, eq(users.id, schema.memberships.userId))
    .where(eq(schema.memberships.workspaceId, workspaceId));
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const raw of names) {
    const q = raw.trim().toLowerCase();
    if (!q) continue;
    const hits = rows.filter((r) => r.email.toLowerCase() === q || (r.name ?? "").toLowerCase() === q || (r.name ?? "").toLowerCase().split(" ")[0] === q);
    if (hits.length === 1) ids.push(hits[0].id);
    else unknown.push(raw);
  }
  return { ids: Array.from(new Set(ids)), unknown };
}
