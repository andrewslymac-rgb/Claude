import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { taskFiles, tasks, users } = schema;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_TASK = 25;

/** Types we'll keep. Anything that a browser could run as a page (HTML, SVG, scripts) is refused. */
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel|vnd\.ms-powerpoint|zip)|audio\/(mpeg|mp4|x-m4a)|video\/(mp4|quicktime))$/i;
/** Types safe to show in the browser instead of downloading. */
export const INLINE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i;

export type TaskFileView = { id: string; name: string; url: string | null; mimeType: string | null; size: number; by: string | null; at: string };

async function assertTask(workspaceId: string, taskId: string) {
  const [t] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId)));
  if (!t) throw new Error("Task not found.");
}

export async function listTaskFiles(workspaceId: string, taskId: string): Promise<TaskFileView[]> {
  const rows = await db
    .select({ id: taskFiles.id, name: taskFiles.name, url: taskFiles.url, mimeType: taskFiles.mimeType, size: taskFiles.size, createdAt: taskFiles.createdAt, by: users.name, email: users.email })
    .from(taskFiles)
    .leftJoin(users, eq(users.id, taskFiles.uploadedById))
    .where(and(eq(taskFiles.workspaceId, workspaceId), eq(taskFiles.taskId, taskId)))
    .orderBy(desc(taskFiles.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, url: r.url, mimeType: r.mimeType, size: r.size, by: r.by ?? r.email?.split("@")[0] ?? null, at: r.createdAt.toISOString() }));
}

async function countFor(workspaceId: string, taskId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(taskFiles).where(and(eq(taskFiles.workspaceId, workspaceId), eq(taskFiles.taskId, taskId)));
  return n;
}

export async function addTaskFile(workspaceId: string, taskId: string, file: { name: string; type: string; bytes: Buffer }, userId: string) {
  await assertTask(workspaceId, taskId);
  if (file.bytes.length === 0) throw new Error("That file is empty.");
  if (file.bytes.length > MAX_FILE_BYTES) throw new Error("Files can be up to 10 MB. For bigger files, put them in Google Drive and attach the link.");
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.test(type)) throw new Error("That file type isn't allowed. Photos, PDFs, Office files, text, audio and video are fine.");
  if ((await countFor(workspaceId, taskId)) >= MAX_FILES_PER_TASK) throw new Error(`A task can hold ${MAX_FILES_PER_TASK} attachments. Remove one first.`);
  const name = file.name.replace(/[\\/\0\r\n]/g, "_").slice(0, 160) || "file";
  const [row] = await db.insert(taskFiles).values({ workspaceId, taskId, name, mimeType: type, size: file.bytes.length, data: file.bytes, uploadedById: userId }).returning({ id: taskFiles.id });
  return row.id;
}

export async function addTaskLink(workspaceId: string, taskId: string, name: string, url: string, userId: string) {
  await assertTask(workspaceId, taskId);
  if ((await countFor(workspaceId, taskId)) >= MAX_FILES_PER_TASK) throw new Error(`A task can hold ${MAX_FILES_PER_TASK} attachments. Remove one first.`);
  await db.insert(taskFiles).values({ workspaceId, taskId, name: name.slice(0, 160), url, size: 0, uploadedById: userId });
}

/** The file's bytes, only if it belongs to this company's task. */
export async function getTaskFile(workspaceId: string, taskId: string, fileId: string) {
  const [row] = await db.select().from(taskFiles).where(and(eq(taskFiles.workspaceId, workspaceId), eq(taskFiles.taskId, taskId), eq(taskFiles.id, fileId)));
  return row ?? null;
}

export async function deleteTaskFile(workspaceId: string, taskId: string, fileId: string) {
  const [row] = await db.select({ by: taskFiles.uploadedById }).from(taskFiles).where(and(eq(taskFiles.workspaceId, workspaceId), eq(taskFiles.taskId, taskId), eq(taskFiles.id, fileId)));
  if (!row) throw new Error("Attachment not found.");
  await db.delete(taskFiles).where(and(eq(taskFiles.workspaceId, workspaceId), eq(taskFiles.id, fileId)));
  return row.by;
}
