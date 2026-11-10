import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import mammoth from "mammoth";
import { db, schema } from "@/db";
import type { CollectionKind } from "@/db/schema";
import * as drive from "./client";
import * as pagesSvc from "@/lib/services/pages";
import { htmlToBlocks, blocksToMarkdown } from "@/lib/markdown";

const { pages, driveConnections, workspaces } = schema;
const SYNC_ACTOR = { type: "sync" as const, userId: null };

export type SyncCounts = { created: number; updated: number; trashed: number; skipped: number };
export type Collection = typeof driveConnections.$inferSelect;

/** What each kind of document area means for the pages inside it. */
export const KIND_INFO: Record<CollectionKind, { label: string; icon: string; docType: string; isSop: boolean; area: string | null; hint: string }> = {
  sop: { label: "SOPs & training", icon: "📘", docType: "SOP", isSop: true, area: null, hint: "Procedures, checklists and training material. Pages are marked as SOPs." },
  legal: { label: "Legal", icon: "⚖️", docType: "Reference", isSop: false, area: "Safety & Compliance", hint: "Formation documents, contracts, insurance, W-9s." },
  licensing: { label: "Licensing", icon: "🪪", docType: "Reference", isSop: false, area: "Safety & Compliance", hint: "Licenses, permits, registrations and renewals." },
  hr: { label: "HR & employees", icon: "👥", docType: "Reference", isSop: false, area: "Onboarding & HR", hint: "Handbooks, onboarding, forms." },
  other: { label: "Other documents", icon: "📁", docType: "Reference", isSop: false, area: null, hint: "Anything else you want to reach from Orbit." },
};

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

/** The title Orbit shows: the Drive name as-is, minus a file extension. */
export function cleanTitle(name: string) {
  return name.replace(/\.(docx?|pdf|xlsx?|pptx?|txt|csv)$/i, "").replace(/\s+/g, " ").trim();
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

const kindOf = (mime: string) => mime.split("/").pop()?.replace("vnd.google-apps.", "").replace("vnd.openxmlformats-officedocument.", "") ?? "file";

/**
 * Walk one document area's folders and upsert one Orbit page per file. Folders become
 * parent pages. Runs idempotently; call it as often as you like.
 */
export async function syncCollection(conn: Collection, opts: { force?: boolean } = {}): Promise<SyncCounts> {
  const workspaceId = conn.workspaceId;
  const info = KIND_INFO[conn.kind] ?? KIND_INFO.other;
  const counts: SyncCounts = { created: 0, updated: 0, trashed: 0, skipped: 0 };
  const seen = new Set<string>();

  // Root page in Orbit that everything in this area hangs under.
  let rootId = conn.rootPageId;
  const root = rootId ? await pagesSvc.getPage(workspaceId, rootId) : null;
  if (!root || root.archivedAt) {
    const created = await pagesSvc.createPage(workspaceId, { title: conn.label || "Google Drive", icon: conn.icon }, SYNC_ACTOR);
    rootId = created.id;
    await db.update(pages).set({ source: "gdrive", driveConnectionId: conn.id, position: -1000 + conn.position }).where(eq(pages.id, rootId));
    await db.update(driveConnections).set({ rootPageId: rootId }).where(eq(driveConnections.id, conn.id));
  } else if (root.title !== conn.label || root.icon !== conn.icon) {
    await db.update(pages).set({ title: conn.label, icon: conn.icon }).where(eq(pages.id, root.id));
  }
  const rootPageId: string = rootId!;

  const existingByFile = new Map(
    (
      await db
        .select({ id: pages.id, title: pages.title, driveFileId: pages.driveFileId, driveModifiedAt: pages.driveModifiedAt, archivedAt: pages.archivedAt, parentId: pages.parentId, driveConnectionId: pages.driveConnectionId, driveMimeType: pages.driveMimeType, drivePushPending: pages.drivePushPending })
        .from(pages)
        .where(and(eq(pages.workspaceId, workspaceId), eq(pages.source, "gdrive")))
    )
      .filter((p) => p.driveFileId)
      .map((p) => [p.driveFileId!, p]),
  );

  async function upsertFolder(f: drive.DriveFile, parentPageId: string, area: string | null): Promise<string> {
    seen.add(f.id);
    const ex = existingByFile.get(f.id);
    if (ex) {
      if (ex.archivedAt) await pagesSvc.restorePage(workspaceId, ex.id);
      await db.update(pages).set({ title: f.name.trim(), parentId: parentPageId, driveConnectionId: conn.id, driveMimeType: drive.FOLDER }).where(eq(pages.id, ex.id));
      return ex.id;
    }
    const p = await pagesSvc.createPage(workspaceId, { parentId: parentPageId, title: f.name.trim(), icon: "📁" }, SYNC_ACTOR);
    await db.update(pages).set({ source: "gdrive", driveFileId: f.id, driveMimeType: drive.FOLDER, driveConnectionId: conn.id, driveModifiedAt: new Date(f.modifiedTime), sourceLink: f.webViewLink ?? null, area }).where(eq(pages.id, p.id));
    counts.created++;
    return p.id;
  }

  async function upsertFile(f: drive.DriveFile, parentPageId: string, area: string | null) {
    seen.add(f.id);
    const ex = existingByFile.get(f.id);
    const modified = new Date(f.modifiedTime);
    const convertible = f.mimeType === drive.GDOC || f.mimeType === drive.DOCX;
    const title = cleanTitle(f.name);
    if (ex && !opts.force && ex.driveModifiedAt && ex.driveModifiedAt >= modified && !ex.archivedAt) {
      // Content unchanged. Still keep the title, parent and area in step with Drive
      // (unless Orbit has a rename of its own waiting to go out).
      if (ex.parentId !== parentPageId || (ex.title !== title && !ex.drivePushPending) || ex.driveConnectionId !== conn.id || ex.driveMimeType !== f.mimeType) {
        await db.update(pages).set({ parentId: parentPageId, ...(ex.drivePushPending ? {} : { title }), driveConnectionId: conn.id, driveMimeType: f.mimeType }).where(eq(pages.id, ex.id));
      }
      counts.skipped++;
      return;
    }
    if (ex && ex.drivePushPending && !ex.archivedAt) {
      // Changed in Drive while Orbit has unsent edits: don't overwrite either side.
      await db.update(pages).set({ driveConflict: true, driveMimeType: f.mimeType }).where(eq(pages.id, ex.id));
      counts.skipped++;
      return;
    }
    let content: unknown[];
    let text: string;
    if (convertible) {
      const c = await fileToBlocks(f);
      content = c!.blocks;
      text = c!.text;
    } else {
      // Sheets, PDFs, videos: a pointer page so people can find it, with the original linked.
      text = `This is a ${kindOf(f.mimeType)} file in Google Drive. Open the original to view it.`;
      content = [{ type: "paragraph", content: [{ type: "link", href: f.webViewLink ?? "#", content: [{ type: "text", text: `Open "${f.name}" in Google Drive`, styles: {} }] }] }, { type: "paragraph", content: text }];
    }
    if (ex) {
      if (ex.archivedAt) await pagesSvc.restorePage(workspaceId, ex.id);
      await pagesSvc.updatePage(workspaceId, ex.id, { title, content, contentText: text }, SYNC_ACTOR, "Updated from Google Drive");
      await db.update(pages).set({ driveModifiedAt: modified, parentId: parentPageId, sourceLink: f.webViewLink ?? null, driveConnectionId: conn.id, driveMimeType: f.mimeType, driveConflict: false }).where(eq(pages.id, ex.id));
      counts.updated++;
    } else {
      const p = await pagesSvc.createPage(workspaceId, { parentId: parentPageId, title, icon: convertible ? "📄" : iconFor(f.mimeType) }, SYNC_ACTOR);
      await db
        .update(pages)
        .set({
          source: "gdrive",
          driveFileId: f.id,
          driveMimeType: f.mimeType,
          driveConnectionId: conn.id,
          driveModifiedAt: modified,
          sourceLink: f.webViewLink ?? null,
          isSop: info.isSop && convertible,
          docType: info.isSop ? (convertible ? "SOP" : "Reference") : info.docType,
          docStatus: "active",
          area: area ?? info.area,
        })
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

  // One folder: its contents sit directly under the root. Several: each folder is a section.
  if (conn.folderIds.length === 1) {
    await walk(conn.folderIds[0], rootPageId, areaFor(conn.folderNames[0] ?? ""));
  } else {
    for (const [i, folderId] of conn.folderIds.entries()) {
      const f = await drive.getFile(folderId);
      const pid = await upsertFolder(f, rootPageId, areaFor(f.name));
      void i;
      await walk(folderId, pid, areaFor(f.name));
    }
  }

  // Anything in this area that was synced before but is no longer in its folders goes to Trash (recoverable).
  for (const [fileId, p] of existingByFile) {
    if (p.driveConnectionId === conn.id && !seen.has(fileId) && !p.archivedAt) {
      await pagesSvc.archivePage(workspaceId, p.id);
      counts.trashed++;
    }
  }

  await db.update(driveConnections).set({ lastSyncAt: new Date(), lastSyncStatus: "ok", lastSyncCounts: counts }).where(eq(driveConnections.id, conn.id));
  return counts;
}

const iconFor = (mime: string) => (mime.includes("pdf") ? "📕" : mime.includes("spreadsheet") || mime.includes("sheet") ? "📊" : mime.includes("video") ? "🎬" : mime.includes("image") ? "🖼️" : mime.includes("presentation") ? "📽️" : "🔗");

/** Sync every document area of a company. */
export async function syncWorkspace(workspaceId: string, opts: { force?: boolean } = {}): Promise<SyncCounts> {
  const conns = await listCollections(workspaceId);
  if (!conns.length) throw new Error("No Drive folder connected");
  const total: SyncCounts = { created: 0, updated: 0, trashed: 0, skipped: 0 };
  for (const c of conns) {
    try {
      const r = await syncCollection(c, opts);
      total.created += r.created;
      total.updated += r.updated;
      total.trashed += r.trashed;
      total.skipped += r.skipped;
    } catch (e) {
      await db.update(driveConnections).set({ lastSyncAt: new Date(), lastSyncStatus: `error: ${(e as Error).message.slice(0, 200)}` }).where(eq(driveConnections.id, c.id));
      throw e;
    }
  }
  return total;
}

export const folderIdFrom = (input: string) => input.trim().match(/folders\/([A-Za-z0-9_-]+)/)?.[1] ?? input.trim().match(/^([A-Za-z0-9_-]{10,})$/)?.[1] ?? null;

export type CollectionInput = { label: string; icon: string; kind: CollectionKind; folderLinks: string[]; excludeLinks: string[] };

async function resolveFolders(links: string[]) {
  const ids = links.map(folderIdFrom);
  if (!ids.length || ids.some((x) => !x)) throw new Error("Paste each folder's link from Google Drive (it contains /folders/…).");
  const names: string[] = [];
  for (const id of ids as string[]) {
    const f = await drive.getFile(id); // throws if the service account can't see it
    if (f.mimeType !== drive.FOLDER) throw new Error(`"${f.name}" isn't a folder.`);
    names.push(f.name);
  }
  return { ids: ids as string[], names };
}

export async function addCollection(workspaceId: string, input: CollectionInput) {
  const { ids, names } = await resolveFolders(input.folderLinks);
  const exclude = input.excludeLinks.map(folderIdFrom).filter((x): x is string => Boolean(x));
  const [{ top }] = await db.select({ top: sql<number>`coalesce(max(position), 0)` }).from(driveConnections).where(eq(driveConnections.workspaceId, workspaceId));
  const [row] = await db
    .insert(driveConnections)
    .values({ workspaceId, label: input.label.trim() || names[0], icon: input.icon || KIND_INFO[input.kind].icon, kind: input.kind, folderIds: ids, folderNames: names, excludeFolderIds: exclude, position: Number(top) + 1 })
    .returning();
  return row;
}

export async function updateCollection(workspaceId: string, id: string, input: CollectionInput) {
  const { ids, names } = await resolveFolders(input.folderLinks);
  const exclude = input.excludeLinks.map(folderIdFrom).filter((x): x is string => Boolean(x));
  const [row] = await db
    .update(driveConnections)
    .set({ label: input.label.trim() || names[0], icon: input.icon || KIND_INFO[input.kind].icon, kind: input.kind, folderIds: ids, folderNames: names, excludeFolderIds: exclude, lastSyncStatus: null, lastSyncCounts: null })
    .where(and(eq(driveConnections.workspaceId, workspaceId), eq(driveConnections.id, id)))
    .returning();
  if (!row) throw new Error("That document area no longer exists.");
  return row;
}

export async function listCollections(workspaceId: string) {
  return db.select().from(driveConnections).where(eq(driveConnections.workspaceId, workspaceId)).orderBy(asc(driveConnections.position), asc(driveConnections.createdAt));
}

export async function getCollection(workspaceId: string, id: string) {
  const [c] = await db.select().from(driveConnections).where(and(eq(driveConnections.workspaceId, workspaceId), eq(driveConnections.id, id)));
  return c ?? null;
}

/** Document counts per area, for the sidebar and dashboard. */
export async function collectionCounts(workspaceId: string) {
  const rows = await db
    .select({ id: pages.driveConnectionId, n: sql<number>`count(*)::int` })
    .from(pages)
    .where(and(eq(pages.workspaceId, workspaceId), eq(pages.source, "gdrive"), isNull(pages.archivedAt), sql`${pages.icon} <> '📁'`, sql`${pages.driveFileId} is not null`))
    .groupBy(pages.driveConnectionId);
  return new Map(rows.filter((r) => r.id).map((r) => [r.id!, r.n]));
}

/** Pages of one area (for the browser view). */
export async function collectionPages(workspaceId: string, connectionId: string) {
  return db
    .select({ id: pages.id, parentId: pages.parentId, title: pages.title, icon: pages.icon, sourceLink: pages.sourceLink, driveFileId: pages.driveFileId, docType: pages.docType, docStatus: pages.docStatus, updatedAt: pages.updatedAt, driveModifiedAt: pages.driveModifiedAt })
    .from(pages)
    .where(and(eq(pages.workspaceId, workspaceId), eq(pages.driveConnectionId, connectionId), isNull(pages.archivedAt)))
    .orderBy(asc(pages.title));
}

/** Remove an area. Its pages go to Trash (recoverable). */
export async function removeCollection(workspaceId: string, id: string) {
  const conn = await getCollection(workspaceId, id);
  if (!conn) return;
  const rows = await db.select({ id: pages.id }).from(pages).where(and(eq(pages.workspaceId, workspaceId), eq(pages.driveConnectionId, id), isNull(pages.archivedAt)));
  if (rows.length) await db.update(pages).set({ archivedAt: new Date() }).where(inArray(pages.id, rows.map((r) => r.id)));
  await db.delete(driveConnections).where(eq(driveConnections.id, id));
}

/** Sync every connected area in every company. Used by the background timer. */
export async function syncAll() {
  if (!(await drive.driveEnabled())) return;
  const rows = await db.select({ conn: driveConnections, name: workspaces.name }).from(driveConnections).innerJoin(workspaces, eq(workspaces.id, driveConnections.workspaceId));
  for (const r of rows) {
    try {
      const c = await syncCollection(r.conn);
      if (c.created || c.updated || c.trashed) console.log(`Drive sync ${r.name} / ${r.conn.label}:`, c);
    } catch (e) {
      console.error(`Drive sync failed for ${r.name} / ${r.conn.label}`, e);
      await db.update(driveConnections).set({ lastSyncAt: new Date(), lastSyncStatus: `error: ${(e as Error).message.slice(0, 200)}` }).where(eq(driveConnections.id, r.conn.id));
    }
  }
}

/** Re-imports one Drive-synced page right away (e.g. after Orbit wrote to the Doc). */
export async function resyncPage(workspaceId: string, pageId: string) {
  const [p] = await db.select().from(pages).where(and(eq(pages.workspaceId, workspaceId), eq(pages.id, pageId)));
  if (!p?.driveFileId) return;
  const f = await drive.getFile(p.driveFileId);
  const c = await fileToBlocks(f);
  if (!c) return;
  await pagesSvc.updatePage(workspaceId, p.id, { content: c.blocks, contentText: c.text }, SYNC_ACTOR, "Updated from Google Drive");
  await db.update(pages).set({ driveModifiedAt: new Date(f.modifiedTime), driveMimeType: f.mimeType }).where(eq(pages.id, p.id));
}

/** Turn two-way sync on or off for an area. Turning it on checks Orbit can actually write there. */
export async function setTwoWay(workspaceId: string, id: string, on: boolean) {
  const conn = await getCollection(workspaceId, id);
  if (!conn) throw new Error("That document area no longer exists.");
  if (on) {
    for (const [i, folderId] of conn.folderIds.entries()) {
      if (!(await drive.folderWritable(folderId))) {
        const sa = await drive.serviceAccount();
        throw new Error(`Orbit can only read "${conn.folderNames[i] ?? "this folder"}". In Google Drive, share it with ${sa?.client_email ?? "Orbit's service account"} as Editor (Content manager on a shared drive), then try again.`);
      }
    }
  }
  await db.update(driveConnections).set({ twoWay: on }).where(eq(driveConnections.id, conn.id));
}
