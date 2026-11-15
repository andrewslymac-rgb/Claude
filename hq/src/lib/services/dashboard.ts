import "server-only";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FieldTool, WidgetConfig, WidgetType } from "@/db/schema";

const { dashboardWidgets, workspaces } = schema;

export type WidgetCategory = "work" | "people" | "documents" | "company" | "personal";
export { CATEGORY_LABELS } from "./dashboard-meta";

export type CatalogEntry = { title: string; description: string; emoji: string; width: number; category: WidgetCategory; configurable?: boolean; listy?: boolean; personal?: boolean; adminOnly?: boolean; needsTasks?: boolean; retired?: boolean };

export const WIDGET_CATALOG: Record<WidgetType, CatalogEntry> = {
  stats: { title: "At a glance", description: "Live numbers: overdue tasks, due today, flags, reviews due, AI approvals.", emoji: "📊", width: 3, category: "work" },
  tracker: { title: "Tracker", description: "Daily, weekly, monthly, quarterly and annual work by person. Tick it off here.", emoji: "☑️", width: 3, category: "work" },
  tasks: { title: "My tasks", description: "Your overdue, due-today and this-week tasks.", emoji: "✅", width: 1, category: "work", listy: true },
  meetings: { title: "Meetings", description: "Latest meeting notes from Google Meet: summaries, decisions and open next steps.", emoji: "🗒️", width: 2, category: "work", listy: true },
  followups: { title: "Follow-ups", description: "Tasks with a follow-up date that has arrived.", emoji: "🔔", width: 1, category: "work", listy: true },
  jobber: { title: "Today in the field", description: "Today's schedule, new requests, quotes waiting, overdue invoices from Jobber or GorillaDesk.", emoji: "🗓️", width: 2, category: "work" },
  calendar: { title: "My calendar", description: "Your own Google Calendar or any calendar feed. Only you see it.", emoji: "📆", width: 2, category: "personal", personal: true, configurable: true },
  notes: { title: "Scratchpad", description: "A private note just for you: reminders, numbers, a parking lot.", emoji: "📝", width: 1, category: "personal", personal: true, configurable: true },
  team: { title: "Team progress", description: "Who's on track, who's behind, at a glance.", emoji: "👥", width: 1, category: "people", listy: true, needsTasks: true },
  // Retired: app links live in the menu (Tools and reports, Links) now. Kept only so old rows type-check.
  tools: { title: "Tools", description: "", emoji: "🧰", width: 3, category: "company", retired: true },
  links: { title: "Quick links", description: "", emoji: "🔗", width: 1, category: "company", retired: true },
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


export function defaultsFor(type: WidgetType, _fieldTool: FieldTool = "none"): WidgetConfig {
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

/**
 * The screen may still show company-widget ids right after a personal copy was made.
 * Map such an id to the matching personal row (same type and position) so the edit lands.
 */
export async function personalId(workspaceId: string, userId: string, id: string) {
  const [mine] = await db.select({ id: dashboardWidgets.id }).from(dashboardWidgets).where(and(scope(workspaceId, userId), eq(dashboardWidgets.id, id)));
  if (mine) return mine.id;
  const [src] = await db.select().from(dashboardWidgets).where(and(scope(workspaceId, null), eq(dashboardWidgets.id, id)));
  if (!src) return id;
  const [copy] = await db
    .select({ id: dashboardWidgets.id })
    .from(dashboardWidgets)
    .where(and(scope(workspaceId, userId), eq(dashboardWidgets.type, src.type), eq(dashboardWidgets.position, src.position)))
    .limit(1);
  return copy?.id ?? id;
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
 * Replace a layout with the command-center set: numbers strip, tracker,
 * field tile, calendar, documents, flags, reviews, recent.
 */
export async function setupCommandCenter(workspaceId: string, userId: string | null) {
  const existing = await db.select().from(dashboardWidgets).where(scope(workspaceId, userId));
  const fieldTool = await fieldToolOf(workspaceId);
  const order: WidgetType[] = ["stats", "tracker", ...(fieldTool === "none" ? [] : (["jobber"] as WidgetType[])), "calendar", "collections", "flags", "reviews", "recent"];
  await db.transaction(async (tx) => {
    await tx.delete(dashboardWidgets).where(scope(workspaceId, userId));
    for (const [i, type] of order.entries()) {
      const config = defaultsFor(type, fieldTool);
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
