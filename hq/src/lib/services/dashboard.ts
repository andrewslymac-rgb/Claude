import "server-only";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FieldTool, LinkItem, WidgetConfig, WidgetType } from "@/db/schema";
import { FIELD_TOOL_INFO } from "@/lib/field-tools";

const { dashboardWidgets, workspaces } = schema;

export type WidgetCategory = "work" | "people" | "documents" | "company" | "personal";
export { CATEGORY_LABELS } from "./dashboard-meta";

export type CatalogEntry = { title: string; description: string; emoji: string; width: number; category: WidgetCategory; configurable?: boolean; listy?: boolean; personal?: boolean; adminOnly?: boolean; needsTasks?: boolean };

export const WIDGET_CATALOG: Record<WidgetType, CatalogEntry> = {
  stats: { title: "At a glance", description: "Live numbers: overdue tasks, due today, flags, reviews due, AI approvals.", emoji: "📊", width: 3, category: "work" },
  tracker: { title: "Tracker", description: "Daily, weekly, monthly, quarterly and annual work by person. Tick it off here.", emoji: "☑️", width: 3, category: "work" },
  tasks: { title: "My tasks", description: "Your overdue, due-today and this-week tasks.", emoji: "✅", width: 1, category: "work", listy: true },
  followups: { title: "Follow-ups", description: "Tasks with a follow-up date that has arrived.", emoji: "🔔", width: 1, category: "work", listy: true },
  jobber: { title: "Today in the field", description: "Today's schedule, new requests, quotes waiting, overdue invoices from Jobber or GorillaDesk.", emoji: "🗓️", width: 2, category: "work" },
  calendar: { title: "My calendar", description: "Your own Google Calendar or any calendar feed. Only you see it.", emoji: "📆", width: 2, category: "personal", personal: true, configurable: true },
  notes: { title: "Scratchpad", description: "A private note just for you: reminders, numbers, a parking lot.", emoji: "📝", width: 1, category: "personal", personal: true, configurable: true },
  team: { title: "Team progress", description: "Who's on track, who's behind, at a glance.", emoji: "👥", width: 1, category: "people", listy: true, needsTasks: true },
  tools: { title: "Tools", description: "Big buttons to Jobber, QuickBooks, Slack and everything else you use.", emoji: "🧰", width: 3, category: "company", configurable: true },
  links: { title: "Quick links", description: "A small row of links.", emoji: "🔗", width: 1, category: "company", configurable: true },
  welcome: { title: "Announcement", description: "A greeting or note for the whole team.", emoji: "📣", width: 3, category: "company", configurable: true },
  flags: { title: "Open flags", description: "Things the team flagged that need a decision.", emoji: "🚩", width: 1, category: "company", listy: true },
  feedback: { title: "Feedback & bugs", description: "New bug reports and ideas about Orbit itself.", emoji: "💬", width: 1, category: "company", listy: true, adminOnly: true },
  ai: { title: "AI approvals", description: "Edits Claude proposed that are waiting for a person to approve.", emoji: "🤖", width: 1, category: "company", listy: true },
  collections: { title: "Documents", description: "SOPs, Legal, Licensing and other document areas.", emoji: "🗂️", width: 1, category: "documents" },
  reviews: { title: "Reviews due", description: "Documents that need a review.", emoji: "📋", width: 1, category: "documents", listy: true },
  changelog: { title: "SOP changes", description: "The latest logged changes to SOPs and policies.", emoji: "📜", width: 1, category: "documents", listy: true },
  recent: { title: "Recently updated", description: "What changed lately.", emoji: "🕒", width: 1, category: "documents", listy: true },
  sops: { title: "SOPs & Policies", description: "Every page marked as an SOP.", emoji: "📚", width: 1, category: "documents", listy: true },
  pages: { title: "Pinned pages", description: "Pages you pick.", emoji: "📌", width: 1, category: "documents", configurable: true },
};

/** Starter launcher for a service business. People edit it from the dashboard. */
export const DEFAULT_TOOLS: LinkItem[] = [
  { label: "QuickBooks", url: "https://app.qbo.intuit.com/", emoji: "💵", color: "#2ca01c", appUrl: "quickbooks://" },
  { label: "Gusto", url: "https://app.gusto.com/", emoji: "🧾", color: "#f45d48", appUrl: "gusto://" },
  { label: "Slack", url: "https://slack.com/", emoji: "💬", color: "#4a154b", appUrl: "slack://open" },
  { label: "Google Drive", url: "https://drive.google.com/", emoji: "📁", color: "#fbbc04", appUrl: "googledrive://" },
  { label: "Gmail", url: "https://mail.google.com/", emoji: "✉️", color: "#ea4335", appUrl: "googlegmail://" },
  { label: "Calendar", url: "https://calendar.google.com/", emoji: "📆", color: "#4285f4", appUrl: "googlecalendar://" },
  { label: "Quo", url: "https://app.openphone.com/", emoji: "📞", color: "#6b4eff", appUrl: "openphone://" },
];

/** Phone app links for the tools we know. Applied to launcher buttons that don't set their own. */
export const KNOWN_APP_LINKS: Record<string, string> = {
  "slack.com": "slack://open",
  "app.slack.com": "slack://open",
  "drive.google.com": "googledrive://",
  "mail.google.com": "googlegmail://",
  "calendar.google.com": "googlecalendar://",
  "app.openphone.com": "openphone://",
  "my.openphone.com": "openphone://",
  "secure.getjobber.com": "jobber://",
  "app.qbo.intuit.com": "quickbooks://",
  "qbo.intuit.com": "quickbooks://",
  "app.gusto.com": "gusto://",
  "app.gorilladesk.com": "gorilladesk://",
};

function toolsFor(fieldTool: FieldTool): LinkItem[] {
  const t = FIELD_TOOL_INFO[fieldTool];
  const first: LinkItem[] = fieldTool === "none" ? [] : [{ label: t.label, url: t.home, emoji: t.emoji, color: t.color, appUrl: KNOWN_APP_LINKS[new URL(t.home).hostname] }];
  if (fieldTool === "gorilladesk") first.push({ label: "LeadSprint", url: "https://app.leadsprint.io/", emoji: "🚀", color: "#f97316" });
  return [...first, ...DEFAULT_TOOLS];
}

const scope = (workspaceId: string, userId: string | null) => and(eq(dashboardWidgets.workspaceId, workspaceId), userId ? eq(dashboardWidgets.userId, userId) : isNull(dashboardWidgets.userId));

/** The company's default layout (userId null). */
export async function listCompanyWidgets(workspaceId: string) {
  return db.select().from(dashboardWidgets).where(scope(workspaceId, null)).orderBy(asc(dashboardWidgets.position));
}

/**
 * What one person sees: their own layout if they've personalised it, otherwise the
 * company default. `personal` says which one came back.
 */
export async function listWidgetsFor(workspaceId: string, userId: string) {
  const mine = await db.select().from(dashboardWidgets).where(scope(workspaceId, userId)).orderBy(asc(dashboardWidgets.position));
  if (mine.length) return { widgets: mine, personal: true };
  return { widgets: await listCompanyWidgets(workspaceId), personal: false };
}

/** Dashboards set up before the tracker existed get it slotted in after Tools, once. */
export async function ensureTrackerWidget(workspaceId: string) {
  const ws = await listCompanyWidgets(workspaceId);
  if (!ws.length || ws.some((w) => w.type === "tracker")) return;
  const tools = ws.find((w) => w.type === "tools");
  if (!tools) return;
  await db.insert(dashboardWidgets).values({ workspaceId, type: "tracker", title: WIDGET_CATALOG.tracker.title, config: {}, width: 3, position: tools.position + 0.5 });
}

export function defaultsFor(type: WidgetType, fieldTool: FieldTool = "none"): WidgetConfig {
  if (type === "links") return { links: [] };
  if (type === "tools") return { links: toolsFor(fieldTool) };
  if (type === "pages") return { pageIds: [] };
  if (type === "welcome") return { text: "Write something for the team…" };
  if (type === "calendar") return { days: 7 };
  if (type === "notes") return { notesBy: {} };
  return { limit: 6 };
}

async function fieldToolOf(workspaceId: string): Promise<FieldTool> {
  const [w] = await db.select({ fieldTool: workspaces.fieldTool }).from(workspaces).where(eq(workspaces.id, workspaceId));
  return w?.fieldTool ?? "none";
}

/**
 * The first time someone customises, their layout is copied from the company default
 * so edits never change what teammates see. Returns true if a copy was made.
 */
export async function ensurePersonalLayout(workspaceId: string, userId: string) {
  const mine = await db.select({ id: dashboardWidgets.id }).from(dashboardWidgets).where(scope(workspaceId, userId)).limit(1);
  if (mine.length) return false;
  const base = await listCompanyWidgets(workspaceId);
  if (base.length) await db.insert(dashboardWidgets).values(base.map((w) => ({ workspaceId, userId, type: w.type, title: w.title, config: w.config, width: w.width, position: w.position })));
  return true;
}

/** Drop the personal layout and go back to the company default. */
export async function resetPersonalLayout(workspaceId: string, userId: string) {
  await db.delete(dashboardWidgets).where(scope(workspaceId, userId));
}

/** An admin makes their own layout the company default (personal widgets such as the scratchpad keep per-person content). */
export async function publishAsCompanyLayout(workspaceId: string, userId: string) {
  const mine = await db.select().from(dashboardWidgets).where(scope(workspaceId, userId)).orderBy(asc(dashboardWidgets.position));
  if (!mine.length) throw new Error("Customise your dashboard first, then publish it.");
  await db.transaction(async (tx) => {
    await tx.delete(dashboardWidgets).where(scope(workspaceId, null));
    await tx.insert(dashboardWidgets).values(mine.map((w) => ({ workspaceId, userId: null, type: w.type, title: w.title, config: w.type === "notes" ? {} : w.config, width: w.width, position: w.position })));
  });
}

export async function addWidget(workspaceId: string, userId: string | null, type: WidgetType) {
  const [{ top }] = await db.select({ top: max(dashboardWidgets.position) }).from(dashboardWidgets).where(scope(workspaceId, userId));
  const [w] = await db
    .insert(dashboardWidgets)
    .values({ workspaceId, userId, type, title: WIDGET_CATALOG[type].title, config: defaultsFor(type, await fieldToolOf(workspaceId)), width: WIDGET_CATALOG[type].width, position: (top ?? 0) + 1 })
    .returning();
  return w;
}

/**
 * Replace a layout with the command-center set: numbers strip, tools, tracker,
 * field tile, calendar, documents, flags, reviews, recent. Existing tool buttons are kept.
 */
export async function setupCommandCenter(workspaceId: string, userId: string | null) {
  const existing = await db.select().from(dashboardWidgets).where(scope(workspaceId, userId));
  const keepTools = existing.find((w) => w.type === "tools")?.config.links ?? existing.find((w) => w.type === "links")?.config.links;
  const fieldTool = await fieldToolOf(workspaceId);
  const order: WidgetType[] = ["stats", "tools", "tracker", ...(fieldTool === "none" ? [] : (["jobber"] as WidgetType[])), "calendar", "collections", "flags", "reviews", "recent"];
  await db.transaction(async (tx) => {
    await tx.delete(dashboardWidgets).where(scope(workspaceId, userId));
    for (const [i, type] of order.entries()) {
      const config = type === "tools" && keepTools?.length ? { links: keepTools } : defaultsFor(type, fieldTool);
      await tx.insert(dashboardWidgets).values({ workspaceId, userId, type, title: WIDGET_CATALOG[type].title, config, width: WIDGET_CATALOG[type].width, position: i + 1 });
    }
  });
}

export async function updateWidget(workspaceId: string, userId: string | null, id: string, patch: { title?: string; config?: WidgetConfig; width?: number }) {
  await db
    .update(dashboardWidgets)
    .set({ ...patch, width: patch.width === undefined ? undefined : Math.min(3, Math.max(1, patch.width)) })
    .where(and(scope(workspaceId, userId), eq(dashboardWidgets.id, id)));
}

/** The scratchpad is per person even on the shared layout: text is keyed by user id inside config. */
export async function saveNote(workspaceId: string, id: string, userId: string, text: string) {
  const [w] = await db.select().from(dashboardWidgets).where(and(eq(dashboardWidgets.workspaceId, workspaceId), eq(dashboardWidgets.id, id)));
  if (!w || w.type !== "notes") throw new Error("That scratchpad no longer exists.");
  if (w.userId && w.userId !== userId) throw new Error("That scratchpad belongs to someone else.");
  await db.update(dashboardWidgets).set({ config: { ...w.config, notesBy: { ...(w.config.notesBy ?? {}), [userId]: text } } }).where(eq(dashboardWidgets.id, id));
}

export async function removeWidget(workspaceId: string, userId: string | null, id: string) {
  await db.delete(dashboardWidgets).where(and(scope(workspaceId, userId), eq(dashboardWidgets.id, id)));
}

export async function reorderWidgets(workspaceId: string, userId: string | null, orderedIds: string[]) {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx.update(dashboardWidgets).set({ position: i + 1 }).where(and(scope(workspaceId, userId), eq(dashboardWidgets.id, id)));
    }
  });
}
