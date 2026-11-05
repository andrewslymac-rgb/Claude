import "server-only";
import { and, asc, eq, max } from "drizzle-orm";
import { db, schema } from "@/db";
import type { WidgetConfig, WidgetType } from "@/db/schema";

const { dashboardWidgets } = schema;

export const WIDGET_CATALOG: Record<WidgetType, { title: string; description: string; emoji: string; available: boolean }> = {
  welcome: { title: "Announcement", description: "A greeting or note for the team", emoji: "📣", available: true },
  links: { title: "Quick links", description: "Buttons to the tools you use every day", emoji: "🔗", available: true },
  sops: { title: "SOPs & Policies", description: "Every page marked as an SOP", emoji: "📚", available: true },
  pages: { title: "Pinned pages", description: "Pages you pick", emoji: "📌", available: true },
  recent: { title: "Recently updated", description: "What changed lately", emoji: "🕒", available: true },
  tasks: { title: "Tasks", description: "Overdue, due today and coming up this week", emoji: "✅", available: true },
  reviews: { title: "Reviews due", description: "Documents that need a review", emoji: "📋", available: true },
};

export async function listWidgets(workspaceId: string) {
  return db.select().from(dashboardWidgets).where(eq(dashboardWidgets.workspaceId, workspaceId)).orderBy(asc(dashboardWidgets.position));
}

export async function addWidget(workspaceId: string, type: WidgetType) {
  const [{ top }] = await db.select({ top: max(dashboardWidgets.position) }).from(dashboardWidgets).where(eq(dashboardWidgets.workspaceId, workspaceId));
  const defaults: WidgetConfig = type === "links" ? { links: [] } : type === "pages" ? { pageIds: [] } : type === "welcome" ? { text: "Write something for the team…" } : { limit: 6 };
  const [w] = await db
    .insert(dashboardWidgets)
    .values({ workspaceId, type, title: WIDGET_CATALOG[type].title, config: defaults, width: type === "welcome" ? 2 : 1, position: (top ?? 0) + 1 })
    .returning();
  return w;
}

export async function updateWidget(workspaceId: string, id: string, patch: { title?: string; config?: WidgetConfig; width?: number }) {
  await db
    .update(dashboardWidgets)
    .set({ ...patch, width: patch.width === undefined ? undefined : Math.min(2, Math.max(1, patch.width)) })
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
