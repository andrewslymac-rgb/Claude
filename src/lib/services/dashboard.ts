import "server-only";
import { and, asc, eq, max } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FieldTool, LinkItem, WidgetConfig, WidgetType } from "@/db/schema";
import { FIELD_TOOL_INFO } from "@/lib/field-tools";

const { dashboardWidgets, workspaces } = schema;

export const WIDGET_CATALOG: Record<WidgetType, { title: string; description: string; emoji: string; available: boolean; width: number }> = {
  tracker: { title: "Tracker", description: "Daily, weekly, monthly, quarterly and annual work by person. Tick it off here.", emoji: "☑️", available: true, width: 3 },
  stats: { title: "At a glance", description: "Live numbers: overdue tasks, flags, reviews due, today's jobs", emoji: "📊", available: true, width: 3 },
  tools: { title: "Tools", description: "Big buttons to Jobber, QuickBooks, Slack and everything else you use", emoji: "🧰", available: true, width: 3 },
  jobber: { title: "Today in the field", description: "Today's schedule, new requests, quotes waiting, overdue invoices from Jobber or GorillaDesk", emoji: "🧰", available: true, width: 2 },
  collections: { title: "Documents", description: "SOPs, Legal, Licensing and other document areas", emoji: "🗂️", available: true, width: 1 },
  tasks: { title: "Tasks", description: "Overdue, due today and coming up this week", emoji: "✅", available: true, width: 1 },
  flags: { title: "Open flags", description: "Things the team flagged that need a decision", emoji: "🚩", available: true, width: 1 },
  reviews: { title: "Reviews due", description: "Documents that need a review", emoji: "📋", available: true, width: 1 },
  recent: { title: "Recently updated", description: "What changed lately", emoji: "🕒", available: true, width: 1 },
  welcome: { title: "Announcement", description: "A greeting or note for the team", emoji: "📣", available: true, width: 3 },
  links: { title: "Quick links", description: "A small row of links", emoji: "🔗", available: true, width: 1 },
  sops: { title: "SOPs & Policies", description: "Every page marked as an SOP", emoji: "📚", available: true, width: 1 },
  pages: { title: "Pinned pages", description: "Pages you pick", emoji: "📌", available: true, width: 1 },
};

/** Starter launcher for a service business. People edit it from the dashboard. */
export const DEFAULT_TOOLS: LinkItem[] = [
  { label: "QuickBooks", url: "https://app.qbo.intuit.com/", emoji: "💵", color: "#2ca01c" },
  { label: "Gusto", url: "https://app.gusto.com/", emoji: "🧾", color: "#f45d48" },
  { label: "Slack", url: "https://slack.com/", emoji: "💬", color: "#4a154b", appUrl: "slack://open" },
  { label: "Google Drive", url: "https://drive.google.com/", emoji: "📁", color: "#fbbc04", appUrl: "googledrive://" },
  { label: "Gmail", url: "https://mail.google.com/", emoji: "✉️", color: "#ea4335", appUrl: "googlegmail://" },
  { label: "Calendar", url: "https://calendar.google.com/", emoji: "📆", color: "#4285f4", appUrl: "googlecalendar://" },
  { label: "Quo", url: "https://app.openphone.com/", emoji: "📞", color: "#6b4eff" },
];

/** Phone app links for the tools we know. Applied to launcher buttons that don't set their own. */
export const KNOWN_APP_LINKS: Record<string, string> = {
  "slack.com": "slack://open",
  "drive.google.com": "googledrive://",
  "mail.google.com": "googlegmail://",
  "calendar.google.com": "googlecalendar://",
};

function toolsFor(fieldTool: FieldTool): LinkItem[] {
  const t = FIELD_TOOL_INFO[fieldTool];
  const first: LinkItem[] = fieldTool === "none" ? [] : [{ label: t.label, url: t.home, emoji: t.emoji, color: t.color }];
  if (fieldTool === "gorilladesk") first.push({ label: "LeadSprint", url: "https://app.leadsprint.io/", emoji: "🚀", color: "#f97316" });
  return [...first, ...DEFAULT_TOOLS];
}

/** Dashboards set up before the tracker existed get it slotted in after Tools, once. */
export async function ensureTrackerWidget(workspaceId: string) {
  const ws = await listWidgets(workspaceId);
  if (ws.some((w) => w.type === "tracker")) return;
  const tools = ws.find((w) => w.type === "tools");
  if (!tools) return;
  await db.insert(dashboardWidgets).values({ workspaceId, type: "tracker", title: WIDGET_CATALOG.tracker.title, config: {}, width: 3, position: tools.position + 0.5 });
}

export async function listWidgets(workspaceId: string) {
  return db.select().from(dashboardWidgets).where(eq(dashboardWidgets.workspaceId, workspaceId)).orderBy(asc(dashboardWidgets.position));
}

function defaultsFor(type: WidgetType, fieldTool: FieldTool = "none"): WidgetConfig {
  if (type === "links") return { links: [] };
  if (type === "tools") return { links: toolsFor(fieldTool) };
  if (type === "pages") return { pageIds: [] };
  if (type === "welcome") return { text: "Write something for the team…" };
  return { limit: 6 };
}

async function fieldToolOf(workspaceId: string): Promise<FieldTool> {
  const [w] = await db.select({ fieldTool: workspaces.fieldTool }).from(workspaces).where(eq(workspaces.id, workspaceId));
  return w?.fieldTool ?? "none";
}

export async function addWidget(workspaceId: string, type: WidgetType) {
  const [{ top }] = await db.select({ top: max(dashboardWidgets.position) }).from(dashboardWidgets).where(eq(dashboardWidgets.workspaceId, workspaceId));
  const [w] = await db
    .insert(dashboardWidgets)
    .values({ workspaceId, type, title: WIDGET_CATALOG[type].title, config: defaultsFor(type, await fieldToolOf(workspaceId)), width: WIDGET_CATALOG[type].width, position: (top ?? 0) + 1 })
    .returning();
  return w;
}

/**
 * Replace the dashboard with the command-center layout: numbers strip, tools,
 * Jobber, documents, tasks, flags, reviews, recent. Existing tools/links are kept.
 */
export async function setupCommandCenter(workspaceId: string) {
  const existing = await listWidgets(workspaceId);
  const keepTools = existing.find((w) => w.type === "tools")?.config.links ?? existing.find((w) => w.type === "links")?.config.links;
  const fieldTool = await fieldToolOf(workspaceId);
  await db.delete(dashboardWidgets).where(eq(dashboardWidgets.workspaceId, workspaceId));
  const order: WidgetType[] = ["stats", "tools", "tracker", ...(fieldTool === "none" ? [] : (["jobber"] as WidgetType[])), "collections", "flags", "reviews", "recent"];
  for (const [i, type] of order.entries()) {
    const config = type === "tools" && keepTools?.length ? { links: keepTools } : defaultsFor(type, fieldTool);
    await db.insert(dashboardWidgets).values({ workspaceId, type, title: WIDGET_CATALOG[type].title, config, width: WIDGET_CATALOG[type].width, position: i + 1 });
  }
}

export async function updateWidget(workspaceId: string, id: string, patch: { title?: string; config?: WidgetConfig; width?: number }) {
  await db
    .update(dashboardWidgets)
    .set({ ...patch, width: patch.width === undefined ? undefined : Math.min(3, Math.max(1, patch.width)) })
    .where(and(eq(dashboardWidgets.workspaceId, workspaceId), eq(dashboardWidgets.id, id)));
}

export async function removeWidget(workspaceId: string, id: string) {
  await db.delete(dashboardWidgets).where(and(eq(dashboardWidgets.workspaceId, workspaceId), eq(dashboardWidgets.id, id)));
}

export async function reorderWidgets(workspaceId: string, orderedIds: string[]) {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx.update(dashboardWidgets).set({ position: i + 1 }).where(and(eq(dashboardWidgets.workspaceId, workspaceId), eq(dashboardWidgets.id, id)));
    }
  });
}
