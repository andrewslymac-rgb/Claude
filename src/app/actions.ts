"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAbility } from "@/lib/access";
import { getCurrentUser, destroySession } from "@/lib/auth/session";
import { can, ForbiddenError } from "@/lib/permissions";
import { widgetTypeEnum, type Role, type WidgetConfig, type WidgetType } from "@/db/schema";
import * as pages from "@/lib/services/pages";
import * as dash from "@/lib/services/dashboard";
import * as members from "@/lib/services/members";
import * as wss from "@/lib/services/workspaces";
import type { Actor } from "@/lib/services/actor";
import * as taskSvc from "@/lib/services/tasks";
import * as flagSvc from "@/lib/services/flags";
import { todayISO } from "@/lib/recurrence";
import * as aiAuth from "@/lib/services/ai-auth";
import * as proposals from "@/lib/services/ai-proposals";
import * as driveSync from "@/lib/drive/sync";
import { COLLECTION_KINDS, FEEDBACK_KINDS, FEEDBACK_STATUSES, FIELD_TOOLS, ROLE_PERMISSIONS, type FieldTool } from "@/db/schema";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import * as feedbackSvc from "@/lib/services/feedback";
import * as rolesSvc from "@/lib/services/roles";

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
  const { mirrorTrash } = await import("@/lib/drive/twoway");
  // Two-way areas: the Doc goes to Drive's trash too (needs Content manager; never blocks the Orbit trash).
  await mirrorTrash(workspace.id, uuid.parse(pageId), true).catch((e) => console.error("Couldn't trash the Google Doc", e));
  await pages.archivePage(workspace.id, uuid.parse(pageId));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function restorePageAction(slug: string, pageId: string) {
  const { workspace } = await requireAbility(slug, "edit");
  await pages.restorePage(workspace.id, uuid.parse(pageId));
  const { mirrorTrash } = await import("@/lib/drive/twoway");
  await mirrorTrash(workspace.id, uuid.parse(pageId), false).catch(() => {});
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

/** ⌘K search: pages, tasks and people in one go. */
export async function searchAllAction(slug: string, q: string) {
  const { workspace, abilities } = await requireAbility(slug, "read");
  const term = z.string().max(200).parse(q).trim().toLowerCase();
  if (!term) return { pages: [], tasks: [], people: [] };
  const [pageHits, allTasks, { members: people }] = await Promise.all([pages.searchPages(workspace.id, term, 8), taskSvc.listTasks(workspace.id), members.listMembers(workspace.id)]);
  const tasks = allTasks
    .filter((t) => t.title.toLowerCase().includes(term) || t.instructions.toLowerCase().includes(term))
    .slice(0, 6)
    .map((t) => ({ id: t.id, title: t.title, frequency: t.frequency, state: t.state, who: t.assignees.map((a) => a.name.split(" ")[0]).join(", ") || t.ownerRole || "anyone" }));
  const canSeeTeam = can(abilities, "manage_tasks");
  const matched = people.filter((m) => (m.name ?? "").toLowerCase().includes(term) || m.email.toLowerCase().includes(term)).slice(0, 5).map((m) => ({ id: m.userId, name: m.name ?? m.email, email: m.email, roles: m.jobRoles.map((r) => `${r.emoji} ${r.name}`).join(", "), canOpen: canSeeTeam }));
  return { pages: pageHits, tasks, people: matched };
}

type Result = { ok: true; message?: string } | { ok: false; error: string };
const wrap = async (fn: () => Promise<string | void>): Promise<Result> => {
  try {
    const message = await fn();
    return { ok: true, message: message ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Please check the form and try again." : (e as Error).message };
  }
};

// ---------------------------------------------------------------- dashboard
// Everyone arranges their own dashboard. The first edit copies the company default
// into a personal layout; admins can publish theirs back as the company default.

const WIDGET_TYPES = widgetTypeEnum.enumValues;

async function personalScope(slug: string) {
  const { user, workspace, abilities } = await requireAbility(slug, "read");
  await dash.ensurePersonalLayout(workspace.id, user.id);
  return { user, workspace, abilities };
}

export async function addWidgetAction(slug: string, type: WidgetType): Promise<Result> {
  return wrap(async () => {
    const { user, workspace, abilities } = await personalScope(slug);
    const t = z.enum(WIDGET_TYPES).parse(type);
    if (dash.WIDGET_CATALOG[t].adminOnly && !can(abilities, "manage_members")) throw new ForbiddenError("That widget is for admins.");
    await dash.addWidget(workspace.id, user.id, t);
    revalidatePath(`/w/${slug}`);
  });
}

const linkSchema = z.object({
  label: z.string().min(1).max(60),
  url: z.string().url().max(2000),
  emoji: z.string().max(8).optional(),
  color: z.string().max(12).optional(),
  appUrl: z.string().max(500).regex(/^[a-z][a-z0-9+.-]*:/i, "App links look like slack://open").optional().or(z.literal("")),
});
const widgetPatch = z.object({
  title: z.string().min(1).max(80).optional(),
  width: z.number().int().min(1).max(3).optional(),
  config: z
    .object({
      text: z.string().max(2000).optional(),
      links: z.array(linkSchema).max(40).optional(),
      pageIds: z.array(uuid).max(40).optional(),
      limit: z.number().int().min(1).max(30).optional(),
      days: z.number().int().min(1).max(31).optional(),
    })
    .optional(),
});

export async function updateWidgetAction(slug: string, id: string, patch: { title?: string; width?: number; config?: WidgetConfig }): Promise<Result> {
  return wrap(async () => {
    const { user, workspace } = await personalScope(slug);
    const p = widgetPatch.parse(patch);
    const wid = await dash.personalId(workspace.id, user.id, uuid.parse(id));
    // Config patches merge so a width change never wipes a widget's links or note.
    const [cur] = await db.select({ config: schema.dashboardWidgets.config }).from(schema.dashboardWidgets).where(and(eq(schema.dashboardWidgets.id, wid), eq(schema.dashboardWidgets.userId, user.id)));
    if (!cur) throw new Error("That tile isn't on your dashboard any more. Refresh the page.");
    await dash.updateWidget(workspace.id, user.id, wid, { ...p, config: p.config ? { ...cur.config, ...p.config } : undefined });
    revalidatePath(`/w/${slug}`);
  });
}

export async function saveNoteAction(slug: string, id: string, text: string): Promise<Result> {
  return wrap(async () => {
    const { user, workspace } = await requireAbility(slug, "read");
    await dash.saveNote(workspace.id, uuid.parse(id), user.id, z.string().max(5000).parse(text));
  });
}

/** Swap the dashboard for the command-center layout. */
export async function setupCommandCenterAction(slug: string): Promise<Result> {
  return wrap(async () => {
    const { user, workspace } = await personalScope(slug);
    await dash.setupCommandCenter(workspace.id, user.id);
    revalidatePath(`/w/${slug}`);
  });
}

export async function removeWidgetAction(slug: string, id: string): Promise<Result> {
  return wrap(async () => {
    const { user, workspace } = await personalScope(slug);
    await dash.removeWidget(workspace.id, user.id, await dash.personalId(workspace.id, user.id, uuid.parse(id)));
    revalidatePath(`/w/${slug}`);
  });
}

export async function reorderWidgetsAction(slug: string, ids: string[]): Promise<Result> {
  return wrap(async () => {
    const { user, workspace } = await personalScope(slug);
    const mapped = await Promise.all(z.array(uuid).parse(ids).map((i) => dash.personalId(workspace.id, user.id, i)));
    await dash.reorderWidgets(workspace.id, user.id, mapped);
    revalidatePath(`/w/${slug}`);
  });
}

/** Back to what the company set up. */
export async function resetDashboardAction(slug: string): Promise<Result> {
  return wrap(async () => {
    const { user, workspace } = await requireAbility(slug, "read");
    await dash.resetPersonalLayout(workspace.id, user.id);
    revalidatePath(`/w/${slug}`);
    return "Your dashboard now matches the company default.";
  });
}

/** Admins: make my layout the default everyone starts from. */
export async function publishDashboardAction(slug: string): Promise<Result> {
  return wrap(async () => {
    const { user, workspace } = await requireAbility(slug, "manage_dashboard");
    await dash.publishAsCompanyLayout(workspace.id, user.id);
    revalidatePath(`/w/${slug}`);
    return "Published. Teammates who haven't customised their own dashboard now see this layout.";
  });
}

// ---------------------------------------------------------------- calendar (per person)

export async function addIcalFeedAction(url: string, label: string): Promise<Result> {
  return wrap(async () => {
    const { getCurrentUser } = await import("@/lib/auth/session");
    const me = await getCurrentUser();
    if (!me) throw new Error("Please sign in again.");
    const { addIcalConnection } = await import("@/lib/calendar");
    await addIcalConnection(me.id, z.string().max(2000).parse(url), z.string().max(60).parse(label));
    return "Feed added.";
  });
}

export async function removeCalendarAction(id: string): Promise<Result> {
  return wrap(async () => {
    const { getCurrentUser } = await import("@/lib/auth/session");
    const me = await getCurrentUser();
    if (!me) throw new Error("Please sign in again.");
    const { removeConnection } = await import("@/lib/calendar");
    await removeConnection(me.id, uuid.parse(id));
  });
}

// ---------------------------------------------------------------- members & workspace


/** Email someone a 3-day sign-in link to this company. Returns whether it went out. */
async function sendWelcome(email: string, workspaceName: string, inviterName: string, role: Role) {
  const { createInviteLink } = await import("@/lib/auth/session");
  const { sendEmail, inviteEmail } = await import("@/lib/email");
  const { ROLE_LABELS } = await import("@/lib/permissions");
  const link = await createInviteLink(email);
  const r = await sendEmail({ to: email.trim().toLowerCase(), ...inviteEmail(link, { workspace: workspaceName, inviter: inviterName, role: ROLE_LABELS[role].label.toLowerCase() === "admin" ? "an Admin" : `a${/^[aeiou]/i.test(ROLE_LABELS[role].label) ? "n" : ""} ${ROLE_LABELS[role].label}` }) });
  return r.ok;
}

export async function addMemberAction(slug: string, email: string, role: Role, firstName: string, lastName: string): Promise<Result> {
  return wrap(async () => {
    const { user, workspace, role: myRole } = await requireAbility(slug, "manage_members");
    const parsed = roleSchema.parse(role);
    const first = z.string().trim().min(1, "Enter their first name.").max(60).parse(firstName);
    const last = z.string().trim().min(1, "Enter their last name.").max(60).parse(lastName);
    await members.addMember(workspace.id, email, parsed, myRole, user.id, { first, last });
    revalidatePath(`/w/${slug}/settings`);
    const sent = await sendWelcome(email, workspace.name, user.name ?? user.email, parsed);
    return sent ? `Added. A sign-in link is on its way to ${email.trim().toLowerCase()}.` : `Added, but the welcome email didn't send. They can go to myorbithq.net and enter ${email.trim().toLowerCase()} to get a sign-in link.`;
  });
}

const nameSchema = z.object({ first: z.string().trim().min(1, "Enter a first name.").max(60), last: z.string().trim().min(1, "Enter a last name.").max(60) });

/** An admin fixing a teammate's name. */
export async function renameMemberAction(slug: string, userId: string, first: string, last: string): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    const n = nameSchema.parse({ first, last });
    await members.renameMember(workspace.id, uuid.parse(userId), n.first, n.last);
    revalidatePath(`/w/${slug}`, "layout");
  });
}

export async function renameInviteAction(slug: string, inviteId: string, first: string, last: string): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    const n = nameSchema.parse({ first, last });
    await members.renameInvite(workspace.id, uuid.parse(inviteId), n.first, n.last);
    revalidatePath(`/w/${slug}/settings`);
  });
}

/** My own email preferences (apply across companies). */
export async function setMyNotificationsAction(prefs: { taskEmail: boolean; digest: boolean }): Promise<Result> {
  return wrap(async () => {
    const { getCurrentUser } = await import("@/lib/auth/session");
    const me = await getCurrentUser();
    if (!me) throw new Error("Please sign in again.");
    const p = z.object({ taskEmail: z.boolean(), digest: z.boolean() }).parse(prefs);
    await db.update(schema.users).set({ notifyTaskEmail: p.taskEmail, notifyDigest: p.digest }).where(eq(schema.users.id, me.id));
  });
}

/** Anyone setting their own name. */
export async function setMyNameAction(first: string, last: string): Promise<Result> {
  return wrap(async () => {
    const { getCurrentUser } = await import("@/lib/auth/session");
    const me = await getCurrentUser();
    if (!me) throw new Error("Please sign in again.");
    const n = nameSchema.parse({ first, last });
    await members.setUserName(me.id, n.first, n.last);
    revalidatePath("/", "layout");
  });
}

/** Resend the welcome sign-in link to a member or a pending invite. */
export async function resendInviteAction(slug: string, email: string): Promise<Result> {
  return wrap(async () => {
    const { user, workspace } = await requireAbility(slug, "manage_members");
    const addr = z.string().email().parse(email.trim().toLowerCase());
    const { members: list, pending } = await members.listMembers(workspace.id);
    const m = list.find((x) => x.email.toLowerCase() === addr);
    const inv = pending.find((x) => x.email.toLowerCase() === addr);
    if (!m && !inv) throw new Error("That person isn't in this company.");
    const sent = await sendWelcome(addr, workspace.name, user.name ?? user.email, (m?.role ?? inv!.role) as Role);
    if (!sent) throw new Error("The email didn't send. Try again in a minute.");
    return `Sign-in link sent to ${addr}.`;
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

const wsSchema = z.object({ name: z.string().trim().min(1).max(80), icon: z.string().max(8).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), fieldTool: z.enum(FIELD_TOOLS).optional() });

export async function updateWorkspaceAction(slug: string, patch: { name?: string; icon?: string; color?: string; fieldTool?: FieldTool }): Promise<Result> {
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
  roleId: uuid.nullable().optional(),
  sopPageId: uuid.nullable().optional(),
  dueOn: isoDate.nullable().optional(),
  assigneeIds: z.array(uuid).max(20).optional(),
});

/** What the New task form needs, loaded on demand so the button can live anywhere. */
export async function taskFormOptionsAction(slug: string) {
  const { workspace } = await requireAbility(slug, "manage_tasks");
  const [{ listMembers }, { listRoles }, { TASK_CATEGORIES }] = await Promise.all([import("@/lib/services/members"), import("@/lib/services/roles"), import("@/db/schema")]);
  const [{ members }, tree, roles] = await Promise.all([listMembers(workspace.id), pages.listTree(workspace.id), listRoles(workspace.id)]);
  return {
    members: members.map((m) => ({ id: m.userId, name: m.name ?? m.email })),
    roles: roles.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, color: r.color })),
    pages: tree.map((p) => ({ id: p.id, title: p.title || "Untitled", icon: p.icon })),
    categories: [...TASK_CATEGORIES],
  };
}

export async function createTaskAction(slug: string, input: z.infer<typeof taskInput>) {
  const { user, workspace } = await requireAbility(slug, "manage_tasks");
  const t = await taskSvc.createTask(workspace.id, taskInput.parse(input), user.id);
  revalidatePath(`/w/${slug}`, "layout");
  return t.id;
}

export async function updateTaskAction(slug: string, id: string, input: Partial<z.infer<typeof taskInput>> & { lastDoneOn?: string | null; nextDueOn?: string | null }) {
  const { user, workspace } = await requireAbility(slug, "manage_tasks");
  const taskId = uuid.parse(id);
  const { lastDoneOn, nextDueOn, ...rest } = input;
  await taskSvc.updateTask(workspace.id, taskId, taskInput.partial().parse(rest), user.id);
  // Order matters: correcting last-done recomputes the next due date; an explicit next-due then wins.
  if (lastDoneOn !== undefined) await taskSvc.correctLastDone(workspace.id, taskId, user.id, lastDoneOn ? isoDate.parse(lastDoneOn) : null);
  if (nextDueOn) await taskSvc.moveDue(workspace.id, taskId, isoDate.parse(nextDueOn));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function archiveTaskAction(slug: string, id: string) {
  const { workspace } = await requireAbility(slug, "manage_tasks");
  await taskSvc.archiveTask(workspace.id, uuid.parse(id));
  revalidatePath(`/w/${slug}`, "layout");
}

/** Viewers may complete tasks too: ticking off work is not "editing". Optional done date and note. */
export async function completeTaskAction(slug: string, id: string, doneOn?: string, note?: string) {
  const { user, workspace } = await requireAbility(slug, "read");
  await taskSvc.completeTask(workspace.id, uuid.parse(id), user.id, doneOn ? isoDate.parse(doneOn) : todayISO(), note?.trim() ? z.string().max(2000).parse(note.trim()) : undefined);
  revalidatePath(`/w/${slug}`, "layout");
}

export async function addTaskNoteAction(slug: string, id: string, body: string) {
  const { user, workspace } = await requireAbility(slug, "read");
  await taskSvc.addNote(workspace.id, uuid.parse(id), user.id, z.string().min(1).max(5000).parse(body));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function listTaskNotesAction(slug: string, id: string) {
  const { workspace } = await requireAbility(slug, "read");
  return taskSvc.listNotes(workspace.id, uuid.parse(id));
}

export async function deleteTaskNoteAction(slug: string, id: string, noteId: string) {
  const { workspace } = await requireAbility(slug, "manage_tasks");
  await taskSvc.deleteNote(workspace.id, uuid.parse(id), uuid.parse(noteId));
  revalidatePath(`/w/${slug}`, "layout");
}

export async function setFollowUpAction(slug: string, id: string, followUpOn: string | null, note?: string | null) {
  const { workspace } = await requireAbility(slug, "read");
  await taskSvc.setFollowUp(workspace.id, uuid.parse(id), followUpOn ? isoDate.parse(followUpOn) : null, note ? z.string().max(500).parse(note) : null);
  revalidatePath(`/w/${slug}`, "layout");
}

/** "Skip this time" / "move due date": pushes the due date without a completion. */
export async function moveDueAction(slug: string, id: string, to?: string) {
  const { workspace } = await requireAbility(slug, "manage_tasks");
  const target = await taskSvc.moveDue(workspace.id, uuid.parse(id), to ? isoDate.parse(to) : undefined);
  revalidatePath(`/w/${slug}`, "layout");
  return target;
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

export async function logChangeAction(
  slug: string,
  pageId: string,
  entry: { note: string; why?: string; teamTold?: boolean; docVersion?: string | null; writeToDrive?: boolean },
): Promise<{ drive: "written" | "skipped" | { error: string } }> {
  const { user, workspace } = await requireAbility(slug, "edit");
  const { writeToDrive, ...parsed } = z
    .object({ note: z.string().trim().min(1).max(500), why: z.string().max(1000).optional(), teamTold: z.boolean().optional(), docVersion: z.string().max(40).nullable().optional(), writeToDrive: z.boolean().optional() })
    .parse(entry);
  const id = uuid.parse(pageId);
  await pages.logChange(workspace.id, id, parsed, userActor(user.id));
  let drive: "written" | "skipped" | { error: string } = "skipped";
  const page = await pages.getPage(workspace.id, id);
  if (writeToDrive && page?.source === "gdrive" && page.driveFileId) {
    try {
      const { getFile, GDOC, appendChangeLogToDoc } = await import("@/lib/drive/client");
      const f = await getFile(page.driveFileId);
      if (f.mimeType !== GDOC) {
        drive = { error: "This is a Word file in Drive, which Orbit can't edit. Convert it to a Google Doc (File → Save as Google Docs) to get change-log write-back." };
      } else {
        const [me] = await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, user.id));
        const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
        const who = me?.name || me?.email?.split("@")[0] || "Orbit";
        const line = `${date}${parsed.docVersion ? ` · ${parsed.docVersion}` : ""} · ${who} — ${parsed.note}${parsed.why ? ` Why: ${parsed.why}` : ""}${parsed.teamTold ? " (Team told)" : ""}`.replace(/\s+/g, " ");
        const r = await appendChangeLogToDoc(page.driveFileId, line);
        if (r.ok) {
          drive = "written";
          const { resyncPage } = await import("@/lib/drive/sync");
          await resyncPage(workspace.id, id).catch(() => {});
        } else drive = { error: r.reason };
      }
    } catch (e) {
      drive = { error: (e as Error).message.slice(0, 200) };
    }
  }
  revalidatePath(`/w/${slug}`, "layout");
  return { drive };
}

// ---------------------------------------------------------------- revision notes

export async function listDocNotesAction(slug: string, pageId: string) {
  const { workspace } = await requireAbility(slug, "read");
  const page = await pages.getPage(workspace.id, uuid.parse(pageId));
  if (!page) throw new Error("Page not found");
  return (await pages.listDocNotes(page.id)).map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), resolvedAt: n.resolvedAt?.toISOString() ?? null }));
}

export async function addDocNoteAction(slug: string, pageId: string, body: string): Promise<Result> {
  return wrap(async () => {
    const { user, workspace } = await requireAbility(slug, "read"); // anyone can point out what needs changing
    await pages.addDocNote(workspace.id, uuid.parse(pageId), user.id, z.string().max(2000).parse(body));
    revalidatePath(`/w/${slug}/library`);
  });
}

export async function resolveDocNoteAction(slug: string, pageId: string, noteId: string, resolved: boolean): Promise<Result> {
  return wrap(async () => {
    const { user, workspace } = await requireAbility(slug, "edit");
    await pages.resolveDocNote(workspace.id, uuid.parse(pageId), uuid.parse(noteId), user.id, resolved);
    revalidatePath(`/w/${slug}/library`);
  });
}

export async function deleteDocNoteAction(slug: string, pageId: string, noteId: string): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "edit");
    await pages.deleteDocNote(workspace.id, uuid.parse(pageId), uuid.parse(noteId));
    revalidatePath(`/w/${slug}/library`);
  });
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

/** Anyone who can read can raise a flag: field staff spot most of the problems. */
export async function createFlagAction(slug: string, input: z.infer<typeof flagInput>) {
  const { user, workspace } = await requireAbility(slug, "read");
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

// ---------------------------------------------------------------- job roles

const roleInput = z.object({ name: z.string().trim().min(1).max(60), emoji: z.string().max(8).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), description: z.string().max(500).optional(), permissions: z.array(z.enum(ROLE_PERMISSIONS)).max(10).optional() });

export async function createRoleAction(slug: string, input: z.infer<typeof roleInput>): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    const r = await rolesSvc.createRole(workspace.id, roleInput.parse(input));
    revalidatePath(`/w/${slug}`, "layout");
    return `Added the ${r.name} role.`;
  });
}

export async function updateRoleAction(slug: string, id: string, input: Partial<z.infer<typeof roleInput>>): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    await rolesSvc.updateRole(workspace.id, uuid.parse(id), roleInput.partial().parse(input));
    revalidatePath(`/w/${slug}`, "layout");
    return "Saved.";
  });
}

export async function deleteRoleAction(slug: string, id: string): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    await rolesSvc.deleteRole(workspace.id, uuid.parse(id));
    revalidatePath(`/w/${slug}`, "layout");
    return "Role removed. Its tasks are now open to anyone.";
  });
}

export async function setRoleMembersAction(slug: string, roleId: string, userIds: string[]): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    await rolesSvc.setRoleMembers(workspace.id, uuid.parse(roleId), z.array(uuid).max(100).parse(userIds));
    revalidatePath(`/w/${slug}`, "layout");
    return "Saved.";
  });
}

export async function setMemberRolesAction(slug: string, userId: string, roleIds: string[]): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    await rolesSvc.setMemberRoles(workspace.id, uuid.parse(userId), z.array(uuid).max(50).parse(roleIds));
    revalidatePath(`/w/${slug}`, "layout");
    return "Saved.";
  });
}

export async function listMembersAction(slug: string) {
  const { workspace } = await requireAbility(slug, "read");
  const { members: m } = await members.listMembers(workspace.id);
  return m.map((x) => ({ id: x.userId, name: x.name ?? x.email }));
}

// ---------------------------------------------------------------- AI access

export async function createApiKeyAction(slug: string, name: string, scopes: string[]) {
  const { user, workspace } = await requireAbility(slug, "manage_members");
  const grant = await aiAuth.createGrant({ workspaceId: workspace.id, userId: user.id, name: z.string().trim().min(1).max(80).parse(name), scopes: aiAuth.parseScopes(scopes.join(" ")) });
  const key = await aiAuth.issueApiKey(grant.id);
  revalidatePath(`/w/${slug}/settings`);
  return key;
}

export async function revokeGrantAction(slug: string, id: string) {
  const { workspace } = await requireAbility(slug, "manage_members");
  await aiAuth.revokeGrant(workspace.id, uuid.parse(id));
  revalidatePath(`/w/${slug}/settings`);
}

/** Put back whatever an AI tool changed. */
export async function undoAiActivityAction(slug: string, id: string) {
  const { user, workspace } = await requireAbility(slug, "edit");
  const a = await aiAuth.getActivity(workspace.id, uuid.parse(id));
  if (!a || a.undoneAt) return;
  if ((a.tool === "update_page" || a.tool === "append_to_page") && a.pageId && a.undoVersionId) {
    await pages.restoreVersion(workspace.id, a.pageId, a.undoVersionId, userActor(user.id));
  } else if (a.tool === "create_page" && a.pageId) {
    await pages.archivePage(workspace.id, a.pageId);
  } else if (a.tool === "create_task" && a.taskId) {
    await taskSvc.archiveTask(workspace.id, a.taskId);
  } else if (a.tool === "complete_task" && a.taskId) {
    await taskSvc.undoComplete(workspace.id, a.taskId);
  }
  await aiAuth.markUndone(workspace.id, a.id);
  revalidatePath(`/w/${slug}`, "layout");
}

// ---------------------------------------------------------------- AI approval queue

export async function approveProposalAction(slug: string, id: string, note?: string) {
  const { user, workspace } = await requireAbility(slug, "manage_dashboard");
  await proposals.approveProposal(workspace.id, uuid.parse(id), user.id, note);
  revalidatePath(`/w/${slug}`, "layout");
}

export async function rejectProposalAction(slug: string, id: string, note?: string) {
  const { user, workspace } = await requireAbility(slug, "manage_dashboard");
  await proposals.rejectProposal(workspace.id, uuid.parse(id), user.id, note);
  revalidatePath(`/w/${slug}`, "layout");
}

export async function setApprovalRuleAction(slug: string, rule: "sops" | "all" | "none") {
  const { workspace } = await requireAbility(slug, "manage_members");
  await proposals.setApprovalRule(workspace.id, z.enum(["sops", "all", "none"]).parse(rule));
  revalidatePath(`/w/${slug}/settings`);
}

// ---------------------------------------------------------------- Google Drive document areas

const collectionInput = z.object({
  label: z.string().max(60),
  icon: z.string().max(8),
  kind: z.enum(COLLECTION_KINDS),
  folderLinks: z.array(z.string().max(500)).min(1).max(10),
  excludeLinks: z.array(z.string().max(500)).max(20),
});

export async function setTwoWayAction(slug: string, id: string, on: boolean): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    await driveSync.setTwoWay(workspace.id, uuid.parse(id), on);
    revalidatePath(`/w/${slug}`, "layout");
    return on ? "Two-way sync is on. Google Docs in this area can now be edited in Orbit." : "Two-way sync is off. This area is read-only in Orbit again.";
  });
}

/** "New document" inside a two-way area: an Orbit page that becomes a Google Doc in that folder. */
export async function createAreaPageAction(slug: string, connId: string, parentPageId: string | null) {
  const { user, workspace } = await requireAbility(slug, "edit");
  const conn = await driveSync.getCollection(workspace.id, uuid.parse(connId));
  if (!conn?.twoWay || !conn.rootPageId) throw new Error("Two-way sync isn't on for this area.");
  const parent = parentPageId ? await pages.getPage(workspace.id, uuid.parse(parentPageId)) : null;
  const parentId = parent && parent.driveConnectionId === conn.id ? parent.id : conn.rootPageId;
  const page = await pages.createPage(workspace.id, { parentId, title: "" }, userActor(user.id));
  const isSop = conn.kind === "sop";
  await db.update(schema.pages).set({ driveConnectionId: conn.id, isSop, docType: isSop ? "SOP" : null, docStatus: "active" }).where(eq(schema.pages.id, page.id));
  revalidatePath(`/w/${slug}`, "layout");
  return page.id;
}

/** Starts converting an area's Word files to Google Docs in the background. */
export async function convertWordFilesAction(slug: string, connId: string): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    const id = uuid.parse(connId);
    const conn = await driveSync.getCollection(workspace.id, id);
    if (!conn?.twoWay) throw new Error("Turn on two-way sync for this area first.");
    if (conn.lastSyncStatus?.startsWith("converting")) return "Already converting. Refresh to see progress.";
    const { convertAreaToGoogleDocs } = await import("@/lib/drive/twoway");
    void convertAreaToGoogleDocs(workspace.id, id).catch((e) => console.error("Word conversion failed", e));
    return "Converting in the background. It takes a few seconds per file; refresh this page to see progress.";
  });
}

export async function resolveDriveConflictAction(slug: string, pageId: string, keep: "orbit" | "drive"): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "edit");
    const { resolveConflict } = await import("@/lib/drive/twoway");
    await resolveConflict(workspace.id, uuid.parse(pageId), z.enum(["orbit", "drive"]).parse(keep));
    revalidatePath(`/w/${slug}`, "layout");
    return keep === "orbit" ? "Done. The Google Doc now matches Orbit." : "Done. Orbit now matches the Google Doc. Your Orbit edits are in History.";
  });
}

export async function addCollectionAction(slug: string, input: z.infer<typeof collectionInput>): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    const conn = await driveSync.addCollection(workspace.id, collectionInput.parse(input));
    const c = await driveSync.syncCollection(conn);
    revalidatePath(`/w/${slug}`, "layout");
    return `Added "${conn.label}". Synced ${c.created} documents.`;
  });
}

export async function updateCollectionAction(slug: string, id: string, input: z.infer<typeof collectionInput>): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    const conn = await driveSync.updateCollection(workspace.id, uuid.parse(id), collectionInput.parse(input));
    const c = await driveSync.syncCollection(conn);
    revalidatePath(`/w/${slug}`, "layout");
    return `Saved "${conn.label}". Synced: ${c.created} new, ${c.updated} updated, ${c.trashed} removed.`;
  });
}

export async function syncDriveAction(slug: string, id?: string): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    let c: driveSync.SyncCounts;
    if (id) {
      const conn = await driveSync.getCollection(workspace.id, uuid.parse(id));
      if (!conn) throw new Error("That document area no longer exists.");
      c = await driveSync.syncCollection(conn, { force: true });
    } else c = await driveSync.syncWorkspace(workspace.id);
    revalidatePath(`/w/${slug}`, "layout");
    return `Synced: ${c.created} new, ${c.updated} updated, ${c.trashed} removed, ${c.skipped} unchanged.`;
  });
}

export async function removeCollectionAction(slug: string, id: string) {
  const { workspace } = await requireAbility(slug, "manage_members");
  await driveSync.removeCollection(workspace.id, uuid.parse(id));
  revalidatePath(`/w/${slug}`, "layout");
}

// ---------------------------------------------------------------- Integrations (Jobber)

export async function saveJobberAppAction(clientId: string, clientSecret: string): Promise<Result> {
  return wrap(async () => {
    const user = await getCurrentUser();
    if (!user?.isAppAdmin) throw new ForbiddenError("Only an app admin can set the Jobber app keys.");
    const { JOBBER_ID_SETTING, JOBBER_SECRET_SETTING } = await import("@/lib/integrations/jobber");
    const { setSetting } = await import("@/lib/services/app-settings");
    if (!clientId.trim() || !clientSecret.trim()) throw new Error("Paste both the client ID and the client secret.");
    await setSetting(JOBBER_ID_SETTING, clientId.trim());
    await setSetting(JOBBER_SECRET_SETTING, clientSecret.trim());
    revalidatePath("/", "layout");
    return "Jobber app keys saved. Now click Connect Jobber.";
  });
}

export async function disconnectJobberAction(slug: string) {
  const { workspace } = await requireAbility(slug, "manage_workspace");
  const { disconnect } = await import("@/lib/integrations/jobber");
  await disconnect(workspace.id);
  revalidatePath(`/w/${slug}`, "layout");
}

export async function testJobberAction(slug: string): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_workspace");
    const { snapshot } = await import("@/lib/integrations/jobber");
    const s = await snapshot(workspace.id, true);
    if (s.errors.length) throw new Error(`Connected, but some data couldn't load: ${s.errors.join(" | ")}`);
    return `Connected to ${s.account ?? "Jobber"}: ${s.today.length} visits today, ${s.requestsNew} new requests, ${s.quotesAwaiting.count} quotes waiting, ${s.invoicesPastDue.count} overdue invoices.`;
  });
}

/** One-click import of the Lemon and Lavender Notion tasks and flags (app admin only). */
export async function importNotionAction(slug: string): Promise<Result> {
  return wrap(async () => {
    const { user, workspace } = await requireAbility(slug, "manage_workspace");
    if (!user.isAppAdmin) throw new ForbiddenError();
    const { importLemonNotion } = await import("@/lib/services/import-notion");
    const r = await importLemonNotion(workspace.id, user.id);
    revalidatePath(`/w/${slug}`, "layout");
    return `Imported ${r.tasksAdded} tasks and ${r.flagsAdded} flags from Notion.`;
  });
}

/** App admins paste the Drive service-account key here instead of into Railway. */
export async function saveDriveKeyAction(json: string): Promise<Result> {
  return wrap(async () => {
    const user = await getCurrentUser();
    if (!user?.isAppAdmin) throw new ForbiddenError("Only an app admin can set the Google key.");
    const { checkServiceAccountJson, DRIVE_KEY_SETTING } = await import("@/lib/drive/client");
    const status = checkServiceAccountJson(json);
    if (status.state !== "ok") throw new Error(status.state === "invalid" ? status.reason : "Paste the key first.");
    const { setSetting } = await import("@/lib/services/app-settings");
    await setSetting(DRIVE_KEY_SETTING, json.trim());
    revalidatePath("/", "layout");
    return `Key saved. Orbit will read Drive as ${status.email}.`;
  });
}

// ---------------------------------------------------------------- feedback

/** Anyone who can open the company can report a problem or suggest something. */
export async function createFeedbackAction(slug: string, input: { kind: string; body: string; pagePath?: string | null }): Promise<Result> {
  return wrap(async () => {
    const { user, workspace } = await requireAbility(slug, "read");
    await feedbackSvc.createFeedback(workspace.id, user.id, { kind: z.enum(FEEDBACK_KINDS).parse(input.kind), body: z.string().min(1).max(5000).parse(input.body), pagePath: input.pagePath ? z.string().max(300).parse(input.pagePath) : null });
    revalidatePath(`/w/${slug}`, "layout");
    return "Thanks. It's on the list.";
  });
}

export async function updateFeedbackAction(slug: string, id: string, patch: { status?: string; response?: string | null }): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    await feedbackSvc.updateFeedback(workspace.id, uuid.parse(id), { status: patch.status ? z.enum(FEEDBACK_STATUSES).parse(patch.status) : undefined, response: patch.response === undefined ? undefined : patch.response ? z.string().max(2000).parse(patch.response) : null });
    revalidatePath(`/w/${slug}`, "layout");
    return "Saved.";
  });
}

export async function deleteFeedbackAction(slug: string, id: string): Promise<Result> {
  return wrap(async () => {
    const { workspace } = await requireAbility(slug, "manage_members");
    await feedbackSvc.deleteFeedback(workspace.id, uuid.parse(id));
    revalidatePath(`/w/${slug}`, "layout");
    return "Deleted.";
  });
}
