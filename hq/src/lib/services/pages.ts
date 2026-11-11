import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, isNotNull, max, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import type { Page } from "@/db/schema";
import { actorUserId, type Actor } from "./actor";

const { pages, pageVersions, users } = schema;

/** Edits by the same person within this window are folded into one history entry. */
const COALESCE_MS = 10 * 60 * 1000;

export type TreeNode = Pick<Page, "id" | "parentId" | "title" | "icon" | "position" | "isSop" | "source">;

export async function listTree(workspaceId: string): Promise<TreeNode[]> {
  const rows = await db
    .select({ id: pages.id, parentId: pages.parentId, title: pages.title, icon: pages.icon, position: pages.position, isSop: pages.isSop, source: pages.source })
    .from(pages)
    .where(and(eq(pages.workspaceId, workspaceId), isNull(pages.archivedAt)))
    .orderBy(asc(pages.position), asc(pages.createdAt));
  // Hide pages whose parent is in the trash.
  const ids = new Set(rows.map((r) => r.id));
  return rows.filter((r) => !r.parentId || ids.has(r.parentId));
}

export async function getPage(workspaceId: string, id: string) {
  const [row] = await db.select().from(pages).where(and(eq(pages.workspaceId, workspaceId), eq(pages.id, id)));
  return row ?? null;
}

export async function getPagesByIds(workspaceId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: pages.id, title: pages.title, icon: pages.icon, archivedAt: pages.archivedAt })
    .from(pages)
    .where(and(eq(pages.workspaceId, workspaceId), inArray(pages.id, ids)));
  const byId = new Map(rows.filter((r) => !r.archivedAt).map((r) => [r.id, r]));
  return ids.map((i) => byId.get(i)).filter((r): r is NonNullable<typeof r> => Boolean(r));
}

export async function listRecent(workspaceId: string, limit = 6) {
  return db
    .select({ id: pages.id, title: pages.title, icon: pages.icon, updatedAt: pages.updatedAt, updatedBy: users.name })
    .from(pages)
    .leftJoin(users, eq(users.id, pages.updatedById))
    .where(and(eq(pages.workspaceId, workspaceId), isNull(pages.archivedAt)))
    .orderBy(desc(pages.updatedAt))
    .limit(limit);
}

export async function listSops(workspaceId: string, limit = 50) {
  return db
    .select({ id: pages.id, title: pages.title, icon: pages.icon, updatedAt: pages.updatedAt, source: pages.source })
    .from(pages)
    .where(and(eq(pages.workspaceId, workspaceId), eq(pages.isSop, true), isNull(pages.archivedAt)))
    .orderBy(asc(pages.title))
    .limit(limit);
}

export async function createPage(workspaceId: string, input: { parentId?: string | null; title?: string; icon?: string | null }, actor: Actor) {
  const parentId = input.parentId ?? null;
  const [{ top }] = await db
    .select({ top: max(pages.position) })
    .from(pages)
    .where(and(eq(pages.workspaceId, workspaceId), parentId ? eq(pages.parentId, parentId) : isNull(pages.parentId)));
  const uid = actorUserId(actor);
  const [page] = await db
    .insert(pages)
    .values({ workspaceId, parentId, title: input.title ?? "", icon: input.icon ?? null, position: (top ?? 0) + 1, createdById: uid, updatedById: uid })
    .returning();
  await db.insert(pageVersions).values({
    pageId: page.id,
    version: 1,
    title: page.title,
    content: [],
    contentText: "",
    actorType: actor.type,
    actorUserId: uid,
    actorTokenId: actor.type === "ai" ? actor.tokenId : null,
    note: "Created",
  });
  return page;
}

export type PageUpdate = { title?: string; icon?: string | null; content?: unknown[]; contentText?: string };

const GDOC = "application/vnd.google-apps.document";

/** A Drive-synced Google Doc in an area with two-way sync on can be edited in Orbit. */
export async function isTwoWayEditable(page: Pick<Page, "source" | "driveConnectionId" | "driveMimeType">) {
  if (page.source !== "gdrive" || page.driveMimeType !== GDOC || !page.driveConnectionId) return false;
  const [c] = await db.select({ twoWay: schema.driveConnections.twoWay }).from(schema.driveConnections).where(eq(schema.driveConnections.id, page.driveConnectionId));
  return Boolean(c?.twoWay);
}

export async function updatePage(workspaceId: string, id: string, patch: PageUpdate, actor: Actor, note?: string) {
  const page = await getPage(workspaceId, id);
  if (!page) throw new Error("Page not found");
  let markPush = false;
  if (page.source === "gdrive" && actor.type !== "sync" && (patch.content || patch.contentText || (patch.title !== undefined && patch.title !== page.title))) {
    if (!(await isTwoWayEditable(page))) {
      if (patch.content || patch.contentText) throw new Error("This page is synced from Google Drive. Edit it in Google Docs.");
    } else markPush = true;
  }
  const uid = actorUserId(actor);
  const now = new Date();
  const next = {
    title: patch.title ?? page.title,
    content: patch.content ?? page.content,
    contentText: patch.contentText ?? page.contentText,
  };

  return db.transaction(async (tx) => {
    const [last] = await tx.select().from(pageVersions).where(eq(pageVersions.pageId, id)).orderBy(desc(pageVersions.version)).limit(1);
    const canFold =
      last &&
      actor.type === "user" &&
      last.actorType === "user" &&
      last.actorUserId === uid &&
      now.getTime() - last.updatedAt.getTime() < COALESCE_MS &&
      !note &&
      !last.note; // never overwrite "Created" / "Restored" checkpoints

    let version = page.version;
    if (canFold) {
      await tx.update(pageVersions).set({ ...next, updatedAt: now }).where(eq(pageVersions.id, last.id));
    } else {
      version = page.version + 1;
      await tx.insert(pageVersions).values({
        pageId: id,
        version,
        ...next,
        actorType: actor.type,
        actorUserId: uid,
        actorTokenId: actor.type === "ai" ? actor.tokenId : null,
        note: note ?? null,
      });
    }
    const [updated] = await tx
      .update(pages)
      .set({ ...next, icon: patch.icon === undefined ? page.icon : patch.icon, version, updatedAt: now, updatedById: uid, ...(markPush ? { drivePushPending: true } : {}) })
      .where(eq(pages.id, id))
      .returning();
    return updated;
  });
}

export async function setSop(workspaceId: string, id: string, isSop: boolean) {
  await db.update(pages).set({ isSop }).where(and(eq(pages.workspaceId, workspaceId), eq(pages.id, id)));
}

export async function movePage(workspaceId: string, id: string, parentId: string | null, position: number) {
  if (parentId === id) throw new Error("A page can't be inside itself");
  // Prevent cycles: walk up from the new parent.
  let cursor = parentId;
  while (cursor) {
    const parent = await getPage(workspaceId, cursor);
    if (!parent) throw new Error("Parent not found");
    if (parent.parentId === id) throw new Error("A page can't be moved inside one of its own sub-pages");
    cursor = parent.parentId;
  }
  await db.update(pages).set({ parentId, position }).where(and(eq(pages.workspaceId, workspaceId), eq(pages.id, id)));
}

export async function archivePage(workspaceId: string, id: string) {
  await db.update(pages).set({ archivedAt: new Date() }).where(and(eq(pages.workspaceId, workspaceId), eq(pages.id, id)));
}

export async function restorePage(workspaceId: string, id: string) {
  const page = await getPage(workspaceId, id);
  if (!page) return;
  let parentId = page.parentId;
  if (parentId) {
    const parent = await getPage(workspaceId, parentId);
    if (!parent || parent.archivedAt) parentId = null; // parent gone: restore to top level
  }
  await db.update(pages).set({ archivedAt: null, parentId }).where(eq(pages.id, id));
}

export async function listTrash(workspaceId: string) {
  return db
    .select({ id: pages.id, title: pages.title, icon: pages.icon, archivedAt: pages.archivedAt })
    .from(pages)
    .where(and(eq(pages.workspaceId, workspaceId), isNotNull(pages.archivedAt)))
    .orderBy(desc(pages.archivedAt));
}

export async function listVersions(pageId: string) {
  return db
    .select({
      id: pageVersions.id,
      version: pageVersions.version,
      title: pageVersions.title,
      actorType: pageVersions.actorType,
      actorName: users.name,
      note: pageVersions.note,
      why: pageVersions.why,
      teamTold: pageVersions.teamTold,
      createdAt: pageVersions.createdAt,
      updatedAt: pageVersions.updatedAt,
    })
    .from(pageVersions)
    .leftJoin(users, eq(users.id, pageVersions.actorUserId))
    .where(eq(pageVersions.pageId, pageId))
    .orderBy(desc(pageVersions.version));
}

export async function getVersion(pageId: string, versionId: string) {
  const [v] = await db.select().from(pageVersions).where(and(eq(pageVersions.pageId, pageId), eq(pageVersions.id, versionId)));
  return v ?? null;
}

/** Restoring never deletes history: it saves the old content as a brand new version. */
export async function restoreVersion(workspaceId: string, pageId: string, versionId: string, actor: Actor) {
  const v = await getVersion(pageId, versionId);
  if (!v) throw new Error("Version not found");
  return updatePage(workspaceId, pageId, { title: v.title, content: v.content, contentText: v.contentText }, actor, `Restored version ${v.version}`);
}

export async function searchPages(workspaceId: string, q: string, limit = 20) {
  const term = q.trim();
  if (!term) return [];
  const like = `%${term.replace(/[%_]/g, "\\$&")}%`;
  const rows = await db
    .select({ id: pages.id, title: pages.title, icon: pages.icon, contentText: pages.contentText, isSop: pages.isSop })
    .from(pages)
    .where(and(eq(pages.workspaceId, workspaceId), isNull(pages.archivedAt), or(ilike(pages.title, like), ilike(pages.contentText, like))))
    .orderBy(sql`case when ${pages.title} ilike ${like} then 0 else 1 end`, desc(pages.updatedAt))
    .limit(limit);
  return rows.map(({ contentText, ...r }) => {
    const i = contentText.toLowerCase().indexOf(term.toLowerCase());
    const snippet = i >= 0 ? contentText.slice(Math.max(0, i - 40), i + term.length + 60).replace(/\s+/g, " ") : "";
    return { ...r, snippet };
  });
}

// ---------------------------------------------------------------------------
// Document info (compliance)
// ---------------------------------------------------------------------------

export type DocInfoPatch = {
  docType?: string | null;
  area?: string | null;
  audience?: string[];
  docStatus?: Page["docStatus"];
  ownerId?: string | null;
  reviewCycle?: Page["reviewCycle"];
  lastReviewedOn?: string | null;
  sourceLink?: string | null;
  sensitive?: boolean;
  docVersion?: string | null;
};

export async function updateDocInfo(workspaceId: string, id: string, patch: DocInfoPatch) {
  await db.update(pages).set(patch).where(and(eq(pages.workspaceId, workspaceId), eq(pages.id, id)));
}

/** Stamp today as the review date and record who did it. */
export async function markReviewed(workspaceId: string, id: string, userId: string, today: string) {
  await db
    .update(pages)
    .set({ lastReviewedOn: today, lastReviewedById: userId, docStatus: sql`case when ${pages.docStatus} = 'needs_review' then 'active'::doc_status else coalesce(${pages.docStatus}, 'active'::doc_status) end` })
    .where(and(eq(pages.workspaceId, workspaceId), eq(pages.id, id)));
}

/** Add a change-log entry: a new version with what/why, without changing the content. */
export async function logChange(workspaceId: string, id: string, entry: { note: string; why?: string; teamTold?: boolean; docVersion?: string | null }, actor: Actor) {
  const page = await getPage(workspaceId, id);
  if (!page) throw new Error("Page not found");
  const uid = actorUserId(actor);
  const version = page.version + 1;
  await db.transaction(async (tx) => {
    await tx.insert(pageVersions).values({
      pageId: id,
      version,
      title: page.title,
      content: page.content,
      contentText: page.contentText,
      actorType: actor.type,
      actorUserId: uid,
      note: entry.note,
      why: entry.why ?? null,
      teamTold: entry.teamTold ?? false,
    });
    await tx
      .update(pages)
      .set({ version, docVersion: entry.docVersion === undefined ? page.docVersion : entry.docVersion, updatedAt: new Date(), updatedById: uid })
      .where(eq(pages.id, id));
  });
}

export async function setTeamTold(pageId: string, versionId: string, teamTold: boolean) {
  await db.update(pageVersions).set({ teamTold }).where(and(eq(pageVersions.pageId, pageId), eq(pageVersions.id, versionId)));
}

/** Every page that has document info set (a type or a status), for the Library. */
export async function listLibrary(workspaceId: string) {
  return db
    .select({
      id: pages.id,
      title: pages.title,
      icon: pages.icon,
      docType: pages.docType,
      area: pages.area,
      audience: pages.audience,
      docStatus: pages.docStatus,
      ownerId: pages.ownerId,
      ownerName: users.name,
      reviewCycle: pages.reviewCycle,
      lastReviewedOn: pages.lastReviewedOn,
      sourceLink: pages.sourceLink,
      source: pages.source,
      isSop: pages.isSop,
      updatedAt: pages.updatedAt,
      driveConnectionId: pages.driveConnectionId,
    })
    .from(pages)
    .leftJoin(users, eq(users.id, pages.ownerId))
    .where(and(eq(pages.workspaceId, workspaceId), isNull(pages.archivedAt), or(isNotNull(pages.docType), isNotNull(pages.docStatus), eq(pages.isSop, true))))
    .orderBy(asc(pages.title));
}

/** Recent change-log entries across the workspace (versions with a note). */
export async function listChangeLog(workspaceId: string, limit = 50) {
  return db
    .select({
      id: pageVersions.id,
      pageId: pages.id,
      pageTitle: pages.title,
      pageIcon: pages.icon,
      version: pageVersions.version,
      note: pageVersions.note,
      why: pageVersions.why,
      teamTold: pageVersions.teamTold,
      actorType: pageVersions.actorType,
      actorName: users.name,
      createdAt: pageVersions.createdAt,
    })
    .from(pageVersions)
    .innerJoin(pages, eq(pages.id, pageVersions.pageId))
    .leftJoin(users, eq(users.id, pageVersions.actorUserId))
    .where(and(eq(pages.workspaceId, workspaceId), isNotNull(pageVersions.note), sql`${pageVersions.note} <> 'Created'`))
    .orderBy(desc(pageVersions.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------- revision notes ("needs changing")

const { docNotes, tasks: tasksT, flags: flagsT } = schema;
const resolvedBy = alias(users, "resolved_by");

export async function listDocNotes(pageId: string) {
  return db
    .select({ id: docNotes.id, body: docNotes.body, createdAt: docNotes.createdAt, resolvedAt: docNotes.resolvedAt, by: users.name, byEmail: users.email, resolvedBy: resolvedBy.name })
    .from(docNotes)
    .leftJoin(users, eq(users.id, docNotes.userId))
    .leftJoin(resolvedBy, eq(resolvedBy.id, docNotes.resolvedById))
    .where(eq(docNotes.pageId, pageId))
    .orderBy(asc(docNotes.resolvedAt), desc(docNotes.createdAt));
}

export async function addDocNote(workspaceId: string, pageId: string, userId: string | null, body: string) {
  const page = await getPage(workspaceId, pageId);
  if (!page) throw new Error("Page not found");
  const text = body.trim();
  if (!text) throw new Error("Write what needs to change first.");
  const [n] = await db.insert(docNotes).values({ pageId, userId, body: text.slice(0, 2000) }).returning();
  return n;
}

export async function resolveDocNote(workspaceId: string, pageId: string, noteId: string, userId: string, resolved: boolean) {
  const page = await getPage(workspaceId, pageId);
  if (!page) throw new Error("Page not found");
  await db.update(docNotes).set(resolved ? { resolvedAt: new Date(), resolvedById: userId } : { resolvedAt: null, resolvedById: null }).where(and(eq(docNotes.pageId, pageId), eq(docNotes.id, noteId)));
}

export async function deleteDocNote(workspaceId: string, pageId: string, noteId: string) {
  const page = await getPage(workspaceId, pageId);
  if (!page) throw new Error("Page not found");
  await db.delete(docNotes).where(and(eq(docNotes.pageId, pageId), eq(docNotes.id, noteId)));
}

/** Open revision notes per page, for the library list. */
export async function openDocNoteCounts(workspaceId: string) {
  const rows = await db
    .select({ pageId: docNotes.pageId, n: sql<number>`count(*)::int` })
    .from(docNotes)
    .innerJoin(pages, eq(pages.id, docNotes.pageId))
    .where(and(eq(pages.workspaceId, workspaceId), isNull(docNotes.resolvedAt)))
    .groupBy(docNotes.pageId);
  return new Map(rows.map((r) => [r.pageId, r.n]));
}

/** What else points at this document: tasks that use it as their how-to, open flags about it, who last edited it. */
export async function pageRelations(workspaceId: string, pageId: string) {
  const [usedBy, openFlags, [page]] = await Promise.all([
    db.select({ id: tasksT.id, title: tasksT.title, frequency: tasksT.frequency }).from(tasksT).where(and(eq(tasksT.workspaceId, workspaceId), eq(tasksT.sopPageId, pageId), isNull(tasksT.archivedAt))).orderBy(asc(tasksT.title)),
    db.select({ id: flagsT.id, title: flagsT.title, severity: flagsT.severity, status: flagsT.status }).from(flagsT).where(and(eq(flagsT.workspaceId, workspaceId), eq(flagsT.pageId, pageId), sql`${flagsT.status} in ('open','in_progress')`)),
    db.select({ updatedAt: pages.updatedAt, updatedBy: users.name, contentText: pages.contentText, driveModifiedAt: pages.driveModifiedAt, createdAt: pages.createdAt }).from(pages).leftJoin(users, eq(users.id, pages.updatedById)).where(eq(pages.id, pageId)),
  ]);
  const words = page?.contentText ? page.contentText.split(/\s+/).filter(Boolean).length : 0;
  return { usedBy, openFlags, meta: { updatedAt: page?.updatedAt ?? null, updatedBy: page?.updatedBy ?? null, driveModifiedAt: page?.driveModifiedAt ?? null, createdAt: page?.createdAt ?? null, words } };
}
