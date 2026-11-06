import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Actor } from "./actor";
import * as pagesSvc from "./pages";
import { logActivity } from "./ai-auth";
import { markdownToBlocks } from "@/lib/markdown";

const { aiProposals, aiGrants, pages, users, workspaces } = schema;

export type ProposalInput = { tool: "create_page" | "update_page" | "append_to_page"; pageId?: string | null; parentId?: string | null; title?: string | null; markdown: string; isSop?: boolean; reason: string };

/** Does this write need a person's approval under the workspace's rule? */
export async function needsApproval(workspaceId: string, target: { pageId?: string | null; isSop?: boolean }) {
  const [ws] = await db.select({ rule: workspaces.aiApproval }).from(workspaces).where(eq(workspaces.id, workspaceId));
  const rule = ws?.rule ?? "sops";
  if (rule === "none") return false;
  if (rule === "all") return true;
  if (target.isSop) return true;
  if (!target.pageId) return false;
  const [p] = await db.select({ isSop: pages.isSop, docType: pages.docType, docStatus: pages.docStatus }).from(pages).where(eq(pages.id, target.pageId));
  return Boolean(p && (p.isSop || p.docType || p.docStatus));
}

export async function createProposal(workspaceId: string, grantId: string, input: ProposalInput) {
  const [p] = await db.insert(aiProposals).values({ workspaceId, grantId, ...input, pageId: input.pageId ?? null, parentId: input.parentId ?? null, title: input.title ?? null, isSop: input.isSop ?? false }).returning();
  return p;
}

export async function listProposals(workspaceId: string, status?: "pending" | "approved" | "rejected") {
  return db
    .select({
      id: aiProposals.id,
      tool: aiProposals.tool,
      pageId: aiProposals.pageId,
      pageTitle: pages.title,
      pageIcon: pages.icon,
      currentText: pages.contentText,
      title: aiProposals.title,
      markdown: aiProposals.markdown,
      isSop: aiProposals.isSop,
      reason: aiProposals.reason,
      status: aiProposals.status,
      reviewNote: aiProposals.reviewNote,
      reviewedAt: aiProposals.reviewedAt,
      reviewerName: users.name,
      grantName: aiGrants.name,
      createdAt: aiProposals.createdAt,
    })
    .from(aiProposals)
    .leftJoin(pages, eq(pages.id, aiProposals.pageId))
    .leftJoin(users, eq(users.id, aiProposals.reviewedById))
    .leftJoin(aiGrants, eq(aiGrants.id, aiProposals.grantId))
    .where(status ? and(eq(aiProposals.workspaceId, workspaceId), eq(aiProposals.status, status)) : eq(aiProposals.workspaceId, workspaceId))
    .orderBy(desc(aiProposals.createdAt))
    .limit(100);
}

export async function countPending(workspaceId: string) {
  const rows = await db.select({ id: aiProposals.id }).from(aiProposals).where(and(eq(aiProposals.workspaceId, workspaceId), eq(aiProposals.status, "pending")));
  return rows.length;
}

/** Apply a pending proposal. The change is recorded as the AI's (not the approver's) so history stays honest. */
export async function approveProposal(workspaceId: string, id: string, reviewerId: string, note?: string) {
  const [p] = await db.select().from(aiProposals).where(and(eq(aiProposals.workspaceId, workspaceId), eq(aiProposals.id, id)));
  if (!p || p.status !== "pending") throw new Error("Proposal not found or already reviewed");
  const actor: Actor = { type: "ai", tokenId: p.grantId ?? "", userId: reviewerId };
  const reason = `${p.reason} (approved by a person)`;
  const grantName = p.grantId ? (await db.select({ n: aiGrants.name }).from(aiGrants).where(eq(aiGrants.id, p.grantId)))[0]?.n : "AI";

  if (p.tool === "create_page") {
    const page = await pagesSvc.createPage(workspaceId, { parentId: p.parentId, title: p.title ?? "Untitled" }, actor);
    await pagesSvc.updatePage(workspaceId, page.id, { content: await markdownToBlocks(p.markdown), contentText: p.markdown }, actor, reason);
    if (p.isSop) await pagesSvc.setSop(workspaceId, page.id, true);
    if (p.grantId) await logActivity({ workspaceId, grantId: p.grantId, tool: "create_page", summary: `Created page "${p.title}" — ${p.reason} (approved)`, pageId: page.id });
  } else if (p.pageId) {
    const before = await pagesSvc.getPage(workspaceId, p.pageId);
    if (!before) throw new Error("Page no longer exists");
    const prev = (await pagesSvc.listVersions(p.pageId))[0];
    const md = p.tool === "append_to_page" ? `${before.contentText}\n\n${p.markdown}`.trim() : p.markdown;
    const content = p.tool === "append_to_page" ? [...before.content, ...(await markdownToBlocks(p.markdown))] : await markdownToBlocks(p.markdown);
    await pagesSvc.updatePage(workspaceId, p.pageId, { content, contentText: md, title: p.title ?? undefined }, actor, reason);
    if (p.grantId) await logActivity({ workspaceId, grantId: p.grantId, tool: p.tool, summary: `${p.tool === "append_to_page" ? "Appended to" : "Edited"} "${p.title ?? before.title}" — ${p.reason} (approved)`, pageId: p.pageId, undoVersionId: prev?.id ?? null });
  }
  void grantName;
  await db.update(aiProposals).set({ status: "approved", reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: note ?? null }).where(eq(aiProposals.id, id));
}

export async function rejectProposal(workspaceId: string, id: string, reviewerId: string, note?: string) {
  await db
    .update(aiProposals)
    .set({ status: "rejected", reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: note ?? null })
    .where(and(eq(aiProposals.workspaceId, workspaceId), eq(aiProposals.id, id), eq(aiProposals.status, "pending")));
}

export async function setApprovalRule(workspaceId: string, rule: "sops" | "all" | "none") {
  await db.update(workspaces).set({ aiApproval: rule }).where(eq(workspaces.id, workspaceId));
}
