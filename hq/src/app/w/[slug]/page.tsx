import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listWidgets, WIDGET_CATALOG } from "@/lib/services/dashboard";
import { getPagesByIds, listRecent, listSops, listTree } from "@/lib/services/pages";
import { Dashboard, type WidgetData } from "@/components/dashboard/Dashboard";
import { listTasks, tasksForUser } from "@/lib/services/tasks";
import { listLibrary } from "@/lib/services/pages";
import { reviewState } from "@/lib/recurrence";

export default async function Home({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, role } = await requireWorkspacePage(slug);
  const widgets = await listWidgets(workspace.id);
  const tree = await listTree(workspace.id);

  const data: WidgetData[] = await Promise.all(
    widgets.map(async (w): Promise<WidgetData> => {
      const base = { id: w.id, type: w.type, title: w.title, width: w.width, config: w.config };
      switch (w.type) {
        case "recent":
          return { ...base, items: (await listRecent(workspace.id, w.config.limit ?? 6)).map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })) };
        case "sops":
          return { ...base, items: (await listSops(workspace.id, w.config.limit ?? 8)).map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })) };
        case "pages":
          return { ...base, items: await getPagesByIds(workspace.id, w.config.pageIds ?? []) };
        case "tasks": {
          const twoDaysAgo = new Date(Date.now() - 2 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
          const mine = tasksForUser(await listTasks(workspace.id), user.id).filter((t) => t.state === "overdue" || t.state === "today" || (t.state === "soon" && !(t.lastDoneOn && t.lastDoneOn >= twoDaysAgo)));
          return { ...base, items: mine.slice(0, w.config.limit ?? 8).map((t) => ({ id: t.id, title: t.title, icon: null, state: t.state, nextDueOn: t.nextDueOn })) };
        }
        case "reviews": {
          const docs = (await listLibrary(workspace.id)).map((d) => ({ ...d, review: reviewState(d.reviewCycle, d.lastReviewedOn) })).filter((d) => d.review === "overdue" || d.review === "due_soon" || d.review === "first");
          return { ...base, items: docs.slice(0, w.config.limit ?? 8).map((d) => ({ id: d.id, title: d.title, icon: d.icon, review: d.review })) };
        }
        default:
          return { ...base, items: [] };
      }
    }),
  );

  const hour = new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Los_Angeles" });
  const greeting = +hour < 12 ? "Good morning" : +hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-10 md:py-10">
      <div className="flex items-center gap-3">
        <span className="text-3xl md:text-4xl">{workspace.icon}</span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {greeting}, {(user.name ?? "").split(" ")[0] || "there"}
          </h1>
          <p className="text-sm text-ink-soft">{workspace.name}</p>
        </div>
      </div>
      <Dashboard
        slug={slug}
        widgets={data}
        canCustomize={can(role, "manage_dashboard")}
        catalog={WIDGET_CATALOG}
        allPages={tree.map((p) => ({ id: p.id, title: p.title || "Untitled", icon: p.icon }))}
      />
    </div>
  );
}
