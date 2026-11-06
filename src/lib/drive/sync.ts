import "server-only";
import { and, eq } from "drizzle-orm";
import mammoth from "mammoth";
import { db, schema } from "@/db";
import * as drive from "./client";
import * as pagesSvc from "@/lib/services/pages";
import { htmlToBlocks, blocksToMarkdown } from "@/lib/markdown";

const { pages, driveConnections, workspaces } = schema;
const SYNC_ACTOR = { type: "sync" as const, userId: null };

export type SyncCounts = { created: number; updated: number; trashed: number; skipped: number };

/** Map a Drive folder name to Orbit's document Area, loosely. */
function areaFor(folderName: string): string | null {
  const n = folderName.toLowerCase();
  if (n.includes("cleaning specialist") || n.includes("field")) return "Field Operations";
  if (n.includes("office") || n.includes("admin") || n.includes("jobber")) return "Office Admin";
  if (n.includes("safety")) return "Safety & Compliance";
  if (n.includes("sales") || n.includes("promo")) return "Sales & Follow-Up";
  if (n.includes("training")) return "Training";
  if (n.includes("hr") || n.includes("employee")) return "Onboarding & HR";
  return null;
}

/** Tidy "SOP_ Foo Bar.docx" → "Foo Bar". */
export function cleanTitle(name: string) {
  return name
    .replace(/\.(docx?|pdf|xlsx?|pptx?)$/i, "")
    .replace(/^SOP[_:\-\s]+/i, "")
    .replace(/^Standard Operating Procedure:\s*/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fileToBlocks(f: drive.DriveFile): Promise<{ blocks: unknown[]; text: string } | null> {
  let html: string | null = null;
  if (f.mimeType === drive.GDOC) html = await drive.exportDocHtml(f.id);
  else if (f.mimeType === drive.DOCX) html = (await mammoth.convertToHtml({ buffer: await drive.download(f.id) })).value;
  if (html === null) return null;
  const blocks = await htmlToBlocks(html);
  const text = await blocksToMarkdown(blocks);
  return { blocks, text };
}

/**
 * Walk the connected folder and upsert one Orbit page per file. Folders become
 * parent pages. Runs idempotently; call it as often as you like.
 */
export async function syncWorkspace(workspaceId: string, opts: { force?: boolean } = {}): Promise<SyncCounts> {
  const [conn] = await db.select().from(driveConnections).where(eq(driveConnections.workspaceId, workspaceId));
  if (!conn) throw new Error("No Drive folder connected");
  const counts: SyncCounts = { created: 0, updated: 0, trashed: 0, skipped: 0 };
  const seen = new Set<string>();

  // Root page in Orbit that everything hangs under.
  let rootId = conn.rootPageId;
  const root = rootId ? await pagesSvc.getPage(workspaceId, rootId) : null;
  if (!root || root.archivedAt) {
    const created = await pagesSvc.createPage(workspaceId, { title: conn.folderName || "Google Drive", icon: "📁" }, SYNC_ACTOR);
    rootId = created.id;
    await db.update(driveConnections).set({ rootPageId: rootId }).where(eq(driveConnections.workspaceId, workspaceId));
  }

  const existingByFile = new Map(
    (await db.select({ id: pages.id, driveFileId: pages.driveFileId, driveModifiedAt: pages.driveModifiedAt, archivedAt: pages.archivedAt, parentId: pages.parentId }).from(pages).where(and(eq(pages.workspaceId, workspaceId), eq(pages.source, "gdrive")))).map((p) => [p.driveFileId!, p]),
  );

  async function upsertFolder(f: drive.DriveFile, parentPageId: string, area: string | null): Promise<string> {
    seen.add(f.id);
    const ex = existingByFile.get(f.id);
    if (ex) {
      if (ex.archivedAt) await pagesSvc.restorePage(workspaceId, ex.id);
      await db.update(pages).set({ title: f.name, parentId: parentPageId }).where(eq(pages.id, ex.id));
      return ex.id;
    }
    const p = await pagesSvc.createPage(workspaceId, { parentId: parentPageId, title: f.name, icon: "📁" }, SYNC_ACTOR);
    await db.update(pages).set({ source: "gdrive", driveFileId: f.id, driveModifiedAt: new Date(f.modifiedTime), sourceLink: f.webViewLink ?? null, area }).where(eq(pages.id, p.id));
    counts.created++;
    return p.id;
  }

  async function upsertFile(f: drive.DriveFile, parentPageId: string, area: string | null) {
    seen.add(f.id);
    const ex = existingByFile.get(f.id);
    const modified = new Date(f.modifiedTime);
    const convertible = f.mimeType === drive.GDOC || f.mimeType === drive.DOCX;
    if (ex && !opts.force && ex.driveModifiedAt && ex.driveModifiedAt >= modified && !ex.archivedAt) {
      if (ex.parentId !== parentPageId) await db.update(pages).set({ parentId: parentPageId }).where(eq(pages.id, ex.id));
      counts.skipped++;
      return;
    }
    const title = cleanTitle(f.name);
    let content: unknown[];
    let text: string;
    if (convertible) {
      const c = await fileToBlocks(f);
      content = c!.blocks;
      text = c!.text;
    } else {
      // Sheets, PDFs, videos: a pointer page so people can find it, with the original linked.
      text = `This is a ${f.mimeType.split("/").pop()?.replace("vnd.google-apps.", "")} file in Google Drive. Open the original to view it.`;
      content = [{ type: "paragraph", content: [{ type: "link", href: f.webViewLink ?? "#", content: [{ type: "text", text: `Open "${f.name}" in Google Drive`, styles: {} }] }] }, { type: "paragraph", content: text }];
    }
    if (ex) {
      if (ex.archivedAt) await pagesSvc.restorePage(workspaceId, ex.id);
      await pagesSvc.updatePage(workspaceId, ex.id, { title, content, contentText: text }, SYNC_ACTOR, "Updated from Google Drive");
      await db.update(pages).set({ driveModifiedAt: modified, parentId: parentPageId, sourceLink: f.webViewLink ?? null }).where(eq(pages.id, ex.id));
      counts.updated++;
    } else {
      const p = await pagesSvc.createPage(workspaceId, { parentId: parentPageId, title, icon: convertible ? "📄" : "🔗" }, SYNC_ACTOR);
      await db
        .update(pages)
        .set({ source: "gdrive", driveFileId: f.id, driveModifiedAt: modified, sourceLink: f.webViewLink ?? null, isSop: convertible, docType: convertible ? "SOP" : "Reference", docStatus: "active", area })
        .where(eq(pages.id, p.id));
      await pagesSvc.updatePage(workspaceId, p.id, { content, contentText: text }, SYNC_ACTOR, "Imported from Google Drive");
      counts.created++;
    }
  }

  async function walk(folderId: string, parentPageId: string, area: string | null) {
    for (const f of await drive.listChildren(folderId)) {
      if (conn.excludeFolderIds.includes(f.id)) continue;
      if (f.mimeType === drive.SHORTCUT) continue; // shortcuts point elsewhere; the target syncs on its own if it's in the folder
      if (f.mimeType === drive.FOLDER) {
        const pid = await upsertFolder(f, parentPageId, area);
        await walk(f.id, pid, areaFor(f.name) ?? area);
      } else {
        try {
          await upsertFile(f, parentPageId, area);
        } catch (e) {
          console.error("Drive sync: failed on", f.name, e);
          counts.skipped++;
        }
      }
    }
  }

  await walk(conn.folderId, rootId!, areaFor(conn.folderName));

  // Anything synced before but no longer in the folder goes to Trash (recoverable).
  for (const [fileId, p] of existingByFile) {
    if (!seen.has(fileId) && !p.archivedAt) {
      await pagesSvc.archivePage(workspaceId, p.id);
      counts.trashed++;
    }
  }

  await db.update(driveConnections).set({ lastSyncAt: new Date(), lastSyncStatus: "ok", lastSyncCounts: counts }).where(eq(driveConnections.workspaceId, workspaceId));
  return counts;
}

export async function connectFolder(workspaceId: string, folderInput: string, excludeFolderIds: string[] = []) {
  const m = folderInput.match(/folders\/([A-Za-z0-9_-]+)/) ?? folderInput.match(/^([A-Za-z0-9_-]{10,})$/);
  if (!m) throw new Error("Paste the folder's link from Google Drive (it contains /folders/…).");
  const folderId = m[1];
  const f = await drive.getFile(folderId); // throws if the service account can't see it
  if (f.mimeType !== drive.FOLDER) throw new Error("That link isn't a folder.");
  await db
    .insert(driveConnections)
    .values({ workspaceId, folderId, folderName: f.name, excludeFolderIds })
    .onConflictDoUpdate({ target: driveConnections.workspaceId, set: { folderId, folderName: f.name, excludeFolderIds, lastSyncStatus: null, lastSyncCounts: null } });
  return f;
}

export async function getConnection(workspaceId: string) {
  const [c] = await db.select().from(driveConnections).where(eq(driveConnections.workspaceId, workspaceId));
  return c ?? null;
}

export async function disconnect(workspaceId: string) {
  await db.delete(driveConnections).where(eq(driveConnections.workspaceId, workspaceId));
}

/** Sync every connected workspace. Used by the background timer. */
export async function syncAll() {
  if (!(await drive.driveEnabled())) return;
  const rows = await db.select({ workspaceId: driveConnections.workspaceId, name: workspaces.name }).from(driveConnections).innerJoin(workspaces, eq(workspaces.id, driveConnections.workspaceId));
  for (const r of rows) {
    try {
      const c = await syncWorkspace(r.workspaceId);
      if (c.created || c.updated || c.trashed) console.log(`Drive sync ${r.name}:`, c);
    } catch (e) {
      console.error(`Drive sync failed for ${r.name}`, e);
      await db.update(driveConnections).set({ lastSyncAt: new Date(), lastSyncStatus: `error: ${(e as Error).message.slice(0, 200)}` }).where(eq(driveConnections.workspaceId, r.workspaceId));
    }
  }
}
