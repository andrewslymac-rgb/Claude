import "server-only";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import * as drive from "./client";
import { blocksToHtml } from "@/lib/markdown";
import { resyncPage } from "./sync";

/**
 * Two-way sync for document areas that have it turned on.
 *
 * Drive → Orbit is the normal sync (sync.ts). Orbit → Drive happens here: edits made in
 * Orbit mark the page "push pending", and a background pass sends it to the Google Doc
 * once nobody has typed for a little while. If the Doc changed in the meantime, nothing
 * is overwritten: the page is flagged as a conflict and a person picks the winner.
 */
const { pages, driveConnections } = schema;
const IDLE_MS = 45_000;

const docHtml = async (content: unknown) => `<html><head><meta charset="utf-8"></head><body>${await blocksToHtml((content as unknown[]) ?? [])}</body></html>`;

/** Sends one page's Orbit content to its Google Doc. */
export async function pushPage(workspaceId: string, pageId: string, opts: { force?: boolean } = {}) {
  const [p] = await db.select().from(pages).where(and(eq(pages.workspaceId, workspaceId), eq(pages.id, pageId)));
  if (!p?.driveFileId || p.driveMimeType !== drive.GDOC) return { status: "skipped" as const };
  const f = await drive.getFile(p.driveFileId);
  const driveChanged = p.driveModifiedAt ? new Date(f.modifiedTime).getTime() > p.driveModifiedAt.getTime() + 1000 : false;
  if (driveChanged && !opts.force) {
    await db.update(pages).set({ driveConflict: true }).where(eq(pages.id, p.id));
    return { status: "conflict" as const };
  }
  const name = p.title.trim() && p.title.trim() !== f.name.replace(/\.(docx?)$/i, "").trim() ? p.title.trim() : undefined;
  const r = await drive.updateDocHtml(p.driveFileId, await docHtml(p.content), name);
  await db.update(pages).set({ driveModifiedAt: new Date(r.modifiedTime), drivePushPending: false, driveConflict: false }).where(eq(pages.id, p.id));
  return { status: "pushed" as const };
}

/** A page made in Orbit inside a two-way area becomes a Google Doc in the matching folder. */
async function createDocFor(pageId: string, folderId: string, connId: string) {
  const [p] = await db.select().from(pages).where(eq(pages.id, pageId));
  if (!p || p.source !== "local" || !p.title.trim()) return;
  const f = await drive.createDocFromHtml(folderId, p.title.trim(), await docHtml(p.content));
  await db
    .update(pages)
    .set({ source: "gdrive", driveFileId: f.id, driveMimeType: drive.GDOC, driveConnectionId: connId, driveModifiedAt: new Date(f.modifiedTime), sourceLink: f.webViewLink ?? null, drivePushPending: false })
    .where(eq(pages.id, p.id));
}

/** Background pass: push idle Orbit edits and create Docs for new Orbit pages. */
export async function pushAllPending() {
  if (!(await drive.driveEnabled())) return;
  const idleBefore = new Date(Date.now() - IDLE_MS);

  const pending = await db
    .select({ id: pages.id, workspaceId: pages.workspaceId, title: pages.title })
    .from(pages)
    .innerJoin(driveConnections, eq(driveConnections.id, pages.driveConnectionId))
    .where(and(eq(pages.drivePushPending, true), eq(pages.driveConflict, false), isNull(pages.archivedAt), eq(driveConnections.twoWay, true), lt(pages.updatedAt, idleBefore)));
  for (const p of pending) {
    try {
      const r = await pushPage(p.workspaceId, p.id);
      if (r.status !== "skipped") console.log(`Two-way sync: ${r.status} "${p.title}"`);
    } catch (e) {
      console.error(`Two-way sync: couldn't push "${p.title}"`, e);
    }
  }

  // New pages created in Orbit directly under a two-way area's root or one of its folders.
  const parent = alias(pages, "parent");
  const fresh = await db
    .select({ id: pages.id, title: pages.title, parentId: parent.id, parentFile: parent.driveFileId, parentIcon: parent.icon, conn: driveConnections })
    .from(pages)
    .innerJoin(parent, eq(parent.id, pages.parentId))
    .innerJoin(driveConnections, eq(driveConnections.id, parent.driveConnectionId))
    .where(and(eq(pages.source, "local"), isNull(pages.archivedAt), eq(driveConnections.twoWay, true), lt(pages.updatedAt, idleBefore), sql`trim(${pages.title}) <> ''`));
  for (const n of fresh) {
    const folderId = n.parentId === n.conn.rootPageId ? n.conn.folderIds[0] : n.parentIcon === "📁" ? n.parentFile : null;
    if (!folderId) continue;
    try {
      await createDocFor(n.id, folderId, n.conn.id);
      console.log(`Two-way sync: created Google Doc "${n.title}"`);
    } catch (e) {
      console.error(`Two-way sync: couldn't create a Doc for "${n.title}"`, e);
    }
  }
}

/** A person settles a conflict: keep Orbit's version (overwrite the Doc) or the Doc's (replace Orbit's). */
export async function resolveConflict(workspaceId: string, pageId: string, keep: "orbit" | "drive") {
  if (keep === "orbit") return pushPage(workspaceId, pageId, { force: true });
  await db.update(pages).set({ drivePushPending: false, driveConflict: false }).where(and(eq(pages.workspaceId, workspaceId), eq(pages.id, pageId)));
  await resyncPage(workspaceId, pageId); // Orbit's version stays in version history
  return { status: "pulled" as const };
}

/** Trashing or restoring a page in Orbit does the same to its Doc in a two-way area. */
export async function mirrorTrash(workspaceId: string, pageId: string, trashed: boolean) {
  const [row] = await db
    .select({ fileId: pages.driveFileId, twoWay: driveConnections.twoWay, icon: pages.icon })
    .from(pages)
    .innerJoin(driveConnections, eq(driveConnections.id, pages.driveConnectionId))
    .where(and(eq(pages.workspaceId, workspaceId), eq(pages.id, pageId)));
  if (!row?.twoWay || !row.fileId || row.icon === "📁") return;
  await drive.setTrashed(row.fileId, trashed);
}
