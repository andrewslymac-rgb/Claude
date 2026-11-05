"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAbility } from "@/lib/access";
import { getCurrentUser, destroySession } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/permissions";
import type { Role, WidgetConfig, WidgetType } from "@/db/schema";
import * as pages from "@/lib/services/pages";
import * as dash from "@/lib/services/dashboard";
import * as members from "@/lib/services/members";
import * as wss from "@/lib/services/workspaces";
import type { Actor } from "@/lib/services/actor";
import * as taskSvc from "@/lib/services/tasks";
import * as flagSvc from "@/lib/services/flags";
import { todayISO } from "@/lib/recurrence";

const userActor = (userId: string): Actor => ({ type: "user", userId });
const uuid = z.string().uuid();
const roleSchema = z.enum(["owner", "admin", "editor", "viewer"]);

// ---------------------------------------------------------------- pages

export async function createPageAction(slug: string, parentId: string | null) {
  const { user, workspace } = await requireAbility(slug, "edit");
  const page = await pages.createPage(workspace.id, { parentId: parentId ? uuid.parse(parentId) : null }, userActor(user.id));
  revalidatePath(`/w/${slug}`, "layout");
  return page.id;
}

const saveSchema = z.object({
  title: z.string().max(500).optional(),
  icon: z.string().max(16).nullable().optional(),
  content: z.array(z.unknown()).optional(),
  contentText: z.string().max(2_000_000).optional(),
});

export async function savePageAction(slug: string, pageId: string, patch: z.infer<typeof saveSchema>) {
  const { user, workspace } = await requireAbility(slug, "edit");
  const updated = await pages.updatePage(workspace.id, uuid.parse(pageId), saveSchema.parse(patch), userActor(user.id));
  if (patch.title !== undefined || patch.icon !== undefined) revalidatePath(`/w/${slug}`, "layout");
  return { version: updated.version, updatedAt: updated.updatedAt.toISOString() };
}

export async function setSopAction(slug: string, pageId: string, isSop: boolean) {
  const { workspace } = await requireAbility(slug, "edit");
  await pages.setSop(workspace.id, uuid.parse(pageId), isSop);
  revalidatePath(`/w/${slug}`, "layout");
}

export async function movePageAction(slug: string, pageId: string, parentId: string | null, position: number) {
  const { workspace } = await requireAbility(slug, "edit");
  await pages.movePage(workspace.id, uuid.parse(pageId), parentId ? uuid.parse(parentId) : null, z.number().parse(position));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function archivePageAction(slug: string, pageId: string) {
  const { workspace } = await requireAbility(slug, "edit");
  await pages.archivePage(workspace.id, uuid.parse(pageId));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function restorePageAction(slug: string, pageId: string) {
  const { workspace } = await requireAbility(slug, "edit");
  await pages.restorePage(workspace.id, uuid.parse(pageId));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function listVersionsAction(slug: string, pageId: string) {
  const { workspace } = await requireAbility(slug, "read");
  const page = await pages.getPage(workspace.id, uuid.parse(pageId));
  if (!page) throw new Error("Page not found");
  const rows = await pages.listVersions(page.id);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
}

export async function getVersionAction(slug: string, pageId: string, versionId: string) {
  const { workspace } = await requireAbility(slug, "read");
  const page = await pages.getPage(workspace.id, uuid.parse(pageId));
  if (!page) throw new Error("Page not found");
  const v = await pages.getVersion(page.id, uuid.parse(versionId));
  return v ? { title: v.title, contentText: v.contentText, content: v.content } : null;
}

export async function restoreVersionAction(slug: string, pageId: string, versionId: string) {
  const { user, workspace } = await requireAbility(slug, "edit");
  const updated = await pages.restoreVersion(workspace.id, uuid.parse(pageId), uuid.parse(versionId), userActor(user.id));
  revalidatePath(`/w/${slug}`, "layout");
  return { title: updated.title, content: updated.content };
}

export async function searchAction(slug: string, q: string) {
  const { workspace } = await requireAbility(slug, "read");
  return pages.searchPages(workspace.id, z.string().max(200).parse(q));
}

// ---------------------------------------------------------------- dashboard

export async function addWidgetAction(slug: string, type: WidgetType) {
  const { workspace } = await requireAbility(slug, "manage_dashboard");
  await dash.addWidget(workspace.id, z.enum(["welcome", "links", "pages", "sops", "recent", "tasks", "reviews"]).parse(type));
  revalidatePath(`/w/${slug}`);
}

const linkSchema = z.object({ label: z.string().min(1).max(60), url: z.string().url().max(2000), emoji: z.string().max(8).optional() });
const widgetPatch = z.object({
  title: z.string().min(1).max(80).optional(),
  width: z.number().int().min(1).max(2).optional(),
  config: z.object({ text: z.string().max(2000).optional(), links: z.array(linkSchema).max(40).optional(), pageIds: z.array(uuid).max(40).optional(), limit: z.number().int().min(1).max(30).optional() }).optional(),
});

export async function updateWidgetAction(slug: string, id: string, patch: { title?: string; width?: number; config?: WidgetConfig }) {
  const { workspace } = await requireAbility(slug, "manage_dashboard");
  await dash.updateWidget(workspace.id, uuid.parse(id), widgetPatch.parse(patch));
  revalidatePath(`/w/${slug}`);
}

export async function removeWidgetAction(slug: string, id: string) {
  const { workspace } = await requireAbility(slug, "manage_dashboard");
  await dash.removeWidget(workspace.id, uuid.parse(id));
  revalidatePath(`/w/${slug}`);
}

export async function reorderWidgetsAction(slug: string, ids: string[]) {
  const { workspace } = await requireAbility(slug, "manage_dashboard");
  await dash.reorderWidgets(workspace.id, z.array(uuid).parse(ids));
  revalidatePath(`/w/${slug}`);
}

// ---------------------------------------------------------------- members & workspace

type Result = { ok: true; message?: string } | { ok: false; error: string };
const wrap = async (fn: () => Promise<string | void>): Promise<Result> => {
  try {
    const message = await fn();
    return { ok: true, message: message ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Please check the form and try again." : (e as Error).message };
  }
};

export async function addMemberAction(slug: string, email: string, role: Role): Promise<Result> {
  return wrap(async () => {
    const { user, workspace, role: myRole } = await requireAbility(slug, "manage_members");
    const r = await members.addMember(workspace.id, email, roleSchema.parse(role), myRole, user.id);
    revalidatePath(`/w/${slug}/settings`);
    return r.status === "added" ? "Added. They'll see this workspace right away." : "Invited. They'll get access the first time they sign in with that email.";
  });
}

export async function changeRoleAction(slug: string, userId: string, role: Role): Promise<Result> {
  return wrap(async () => {
    const { workspace, role: myRole } = await requireAbility(slug, "manage_members");
    await members.changeRole(workspace.id, uuid.parse(userId), roleSchema.parse(role), myRole);
    revalidatePath(`/w/${slug}/settings`);
  });
}

export async function removeMemberAction(slug: string, userId: string): Promise<Result> {
  return wrap(async () => {
    const { workspace, role: myRole } = await requireAbility(slug, "manage_members");
    await members.removeMember(workspace.id, uuid.parse(userId), myRole);
    revalidatePath(`/w/${slug}/settings`);
  });
}

export async function cancelInviteAction(slug: string, inviteId: string): Promise<Result> {
  return wrap(async () => {
    const { workspace, role: myRole } = await requireAbility(slug, "manage_members");
    await members.cancelInvite(workspace.id, uuid.parse(inviteId), myRole);
    revalidatePath(`/w/${slug}/settings`);
  });
}

const wsSchema = z.object({ name: z.string().trim().min(1).max(80), icon: z.string().max(8).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional() });

export async function updateWorkspaceAction(slug: string, patch: { name?: string; icon?: string; color?: string }): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_workspace");
    await wss.updateWorkspace(workspace.id, wsSchema.partial().parse(patch));
    revalidatePath(`/w/${slug}`, "layout");
    return "Saved.";
  });
}

export async function createWorkspaceAction(input: { name: string; icon?: string; color?: string }) {
  const user = await getCurrentUser();
  if (!user?.isAppAdmin) throw new ForbiddenError("Only app admins can create workspaces.");
  const ws = await wss.createWorkspace(wsSchema.parse(input), user.id);
  redirect(`/w/${ws.slug}`);
}

export async function signOutAction() {
  await destroySession();
  redirect("/login");
}

// ---------------------------------------------------------------- tasks

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const taskInput = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().max(40).nullable().optional(),
  frequency: z.enum(["once", "daily", "weekly", "monthly", "quarterly", "annual"]),
  whenText: z.string().max(120).nullable().optional(),
  instructions: z.string().max(20000).optional(),
  ownerRole: z.string().max(60).nullable().optional(),
  sopPageId: uuid.nullable().optional(),
  dueOn: isoDate.nullable().optional(),
  assigneeIds: z.array(uuid).max(20).optional(),
});

export async function createTaskAction(slug: string, input: z.infer<typeof taskInput>) {
  const { user, workspace } = await requireAbility(slug, "edit");
  const t = await taskSvc.createTask(workspace.id, taskInput.parse(input), user.id);
  revalidatePath(`/w/${slug}`, "layout");
  return t.id;
}

export async function updateTaskAction(slug: string, id: string, input: Partial<z.infer<typeof taskInput>>) {
  const { workspace } = await requireAbility(slug, "edit");
  await taskSvc.updateTask(workspace.id, uuid.parse(id), taskInput.partial().parse(input));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function archiveTaskAction(slug: string, id: string) {
  const { workspace } = await requireAbility(slug, "edit");
  await taskSvc.archiveTask(workspace.id, uuid.parse(id));
  revalidatePath(`/w/${slug}`, "layout");
}

/** Viewers may complete tasks too: ticking off work is not "editing". */
export async function completeTaskAction(slug: string, id: string, doneOn?: string) {
  const { user, workspace } = await requireAbility(slug, "read");
  await taskSvc.completeTask(workspace.id, uuid.parse(id), user.id, doneOn ? isoDate.parse(doneOn) : todayISO());
  revalidatePath(`/w/${slug}`, "layout");
}

export async function undoTaskAction(slug: string, id: string) {
  const { workspace } = await requireAbility(slug, "read");
  await taskSvc.undoComplete(workspace.id, uuid.parse(id));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function listCompletionsAction(slug: string, id: string) {
  const { workspace } = await requireAbility(slug, "read");
  return taskSvc.listCompletions(workspace.id, uuid.parse(id));
}

// ---------------------------------------------------------------- document info & change log

const docInfo = z.object({
  docType: z.string().max(40).nullable().optional(),
  area: z.string().max(60).nullable().optional(),
  audience: z.array(z.string().max(40)).max(10).optional(),
  docStatus: z.enum(["active", "needs_review", "draft", "outdated", "archived"]).nullable().optional(),
  ownerId: uuid.nullable().optional(),
  reviewCycle: z.enum(["quarterly", "semiannual", "annual"]).nullable().optional(),
  lastReviewedOn: isoDate.nullable().optional(),
  sourceLink: z.string().url().max(2000).nullable().optional().or(z.literal("").transform(() => null)),
  sensitive: z.boolean().optional(),
  docVersion: z.string().max(40).nullable().optional(),
});

export async function updateDocInfoAction(slug: string, pageId: string, patch: z.infer<typeof docInfo>) {
  const { workspace } = await requireAbility(slug, "edit");
  await pages.updateDocInfo(workspace.id, uuid.parse(pageId), docInfo.parse(patch));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function markReviewedAction(slug: string, pageId: string) {
  const { user, workspace } = await requireAbility(slug, "edit");
  await pages.markReviewed(workspace.id, uuid.parse(pageId), user.id, todayISO());
  revalidatePath(`/w/${slug}`, "layout");
  return todayISO();
}

export async function logChangeAction(slug: string, pageId: string, entry: { note: string; why?: string; teamTold?: boolean; docVersion?: string | null }) {
  const { user, workspace } = await requireAbility(slug, "edit");
  const parsed = z.object({ note: z.string().trim().min(1).max(500), why: z.string().max(1000).optional(), teamTold: z.boolean().optional(), docVersion: z.string().max(40).nullable().optional() }).parse(entry);
  await pages.logChange(workspace.id, uuid.parse(pageId), parsed, userActor(user.id));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function setTeamToldAction(slug: string, pageId: string, versionId: string, teamTold: boolean) {
  const { workspace } = await requireAbility(slug, "edit");
  const page = await pages.getPage(workspace.id, uuid.parse(pageId));
  if (!page) throw new Error("Page not found");
  await pages.setTeamTold(page.id, uuid.parse(versionId), teamTold);
  revalidatePath(`/w/${slug}`, "layout");
}

// ---------------------------------------------------------------- flags

const flagInput = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(["contradiction", "duplicate", "missing_document", "outdated", "incomplete", "open_decision", "compliance_risk", "naming_mismatch"]),
  severity: z.enum(["high", "medium", "low"]),
  status: z.enum(["open", "in_progress", "resolved", "wont_fix"]).optional(),
  whoDecides: z.string().max(60).nullable().optional(),
  whatWeFound: z.string().max(5000).optional(),
  nextStep: z.string().max(2000).optional(),
  pageId: uuid.nullable().optional(),
  ownerId: uuid.nullable().optional(),
});

export async function createFlagAction(slug: string, input: z.infer<typeof flagInput>) {
  const { user, workspace } = await requireAbility(slug, "edit");
  await flagSvc.createFlag(workspace.id, flagInput.parse(input), user.id);
  revalidatePath(`/w/${slug}`, "layout");
}

export async function updateFlagAction(slug: string, id: string, patch: Partial<z.infer<typeof flagInput>>) {
  const { workspace } = await requireAbility(slug, "edit");
  await flagSvc.updateFlag(workspace.id, uuid.parse(id), flagInput.partial().parse(patch));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function deleteFlagAction(slug: string, id: string) {
  const { workspace } = await requireAbility(slug, "edit");
  await flagSvc.deleteFlag(workspace.id, uuid.parse(id));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function listMembersAction(slug: string) {
  const { workspace } = await requireAbility(slug, "read");
  const { members: m } = await members.listMembers(workspace.id);
  return m.map((x) => ({ id: x.userId, name: x.name ?? x.email }));
}
