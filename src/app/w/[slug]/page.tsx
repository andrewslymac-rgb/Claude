import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listWidgets, WIDGET_CATALOG, KNOWN_APP_LINKS, ensureTrackerWidget } from "@/lib/services/dashboard";
import { getPagesByIds, listRecent, listSops, listTree, listLibrary } from "@/lib/services/pages";
import { Dashboard, type WidgetData, type Stat } from "@/components/dashboard/Dashboard";
import { listTasks, tasksForUser } from "@/lib/services/tasks";
import { listFlags } from "@/lib/services/flags";
import { countPending } from "@/lib/services/ai-proposals";
import { reviewState } from "@/lib/recurrence";
import { collectionCounts, listCollections } from "@/lib/drive/sync";
import { getIntegration, MANUAL_TOKEN } from "@/lib/integrations/jobber";
import { listMembers } from "@/lib/services/members";
import { listRoles } from "@/lib/services/roles";
import { TASK_CATEGORIES } from "@/db/schema";

const safeHost = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};

export default async function Home({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, abilities, roleIds } = await requireWorkspacePage(slug);
  await ensureTrackerWidget(workspace.id);
  const [widgets, tree, allTasks, flags, library, collections, counts, jobber, pendingAi] = await Promise.all([
    listWidgets(workspace.id),
    listTree(workspace.id),
    listTasks(workspace.id),
    listFlags(workspace.id),
    listLibrary(workspace.id),
    listCollections(workspace.id),
    collectionCounts(workspace.id),
    workspace.fieldTool === "none" ? Promise.resolve(null) : getIntegration(workspace.id, workspace.fieldTool),
    countPending(workspace.id),
  ]);
  const twoDaysAgo = new Date(Date.now() - 2 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const overdue = allTasks.filter((t) => t.state === "overdue").length;
  const dueToday = allTasks.filter((t) => t.state === "today").length;
  const openFlags = flags.filter((f) => f.status === "open");
  const reviewsDue = library.filter((d) => ["overdue", "due_soon", "first"].includes(reviewState(d.reviewCycle, d.lastReviewedOn)));

  const stats: Stat[] = [
    { key: "overdue", label: "Overdue tasks", value: overdue, href: `/w/${slug}/tasks`, tone: overdue ? "danger" : "ok" },
    { key: "today", label: "Due today", value: dueToday, href: `/w/${slug}/tasks`, tone: dueToday ? "warn" : "ok" },
    { key: "flags", label: "Open flags", value: openFlags.length, href: `/w/${slug}/flags`, tone: openFlags.length ? "warn" : "ok" },
    { key: "reviews", label: "Reviews due", value: reviewsDue.length, href: `/w/${slug}/library`, tone: reviewsDue.length ? "accent" : "ok" },
    { key: "ai", label: "AI awaiting approval", value: pendingAi, href: `/w/${slug}/ai`, tone: pendingAi ? "accent" : "muted" },
  ];

  const data: WidgetData[] = await Promise.all(
    widgets.map(async (w): Promise<WidgetData> => {
      // Existing launcher buttons get the phone app links we know about, unless they set their own.
      const config = w.type === "tools" && w.config.links ? { ...w.config, links: w.config.links.map((l) => ({ ...l, appUrl: l.appUrl || KNOWN_APP_LINKS[safeHost(l.url)] })) } : w.config;
      const base = { id: w.id, type: w.type, title: w.title, width: w.width, config };
      switch (w.type) {
        case "recent":
          return { ...base, items: (await listRecent(workspace.id, w.config.limit ?? 6)).map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })) };
        case "sops":
          return { ...base, items: (await listSops(workspace.id, w.config.limit ?? 8)).map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })) };
        case "pages":
          return { ...base, items: await getPagesByIds(workspace.id, w.config.pageIds ?? []) };
        case "tasks": {
          const mine = tasksForUser(allTasks, user.id, roleIds).filter((t) => t.state === "overdue" || t.state === "today" || (t.state === "soon" && !(t.lastDoneOn && t.lastDoneOn >= twoDaysAgo)));
          return { ...base, items: mine.slice(0, w.config.limit ?? 8).map((t) => ({ id: t.id, title: t.title, icon: null, state: t.state, nextDueOn: t.nextDueOn })) };
        }
        case "reviews":
          return { ...base, items: reviewsDue.slice(0, w.config.limit ?? 8).map((d) => ({ id: d.id, title: d.title, icon: d.icon, review: reviewState(d.reviewCycle, d.lastReviewedOn) })) };
        case "flags":
          return { ...base, items: openFlags.slice(0, w.config.limit ?? 8).map((f) => ({ id: f.id, title: f.title, icon: null, state: f.severity })) };
        case "collections":
          return { ...base, items: collections.map((c) => ({ id: c.id, title: c.label, icon: c.icon, count: counts.get(c.id) ?? 0, kind: c.kind })) };
        case "jobber":
          return { ...base, items: [], connected: Boolean(jobber), manual: jobber?.accessToken === MANUAL_TOKEN, fieldTool: workspace.fieldTool };
        case "tracker": {
          const [{ members }, roles] = await Promise.all([listMembers(workspace.id), listRoles(workspace.id)]);
          return {
            ...base,
            items: [],
            tracker: {
              tasks: allTasks,
              members: members.map((m) => ({ id: m.userId, name: m.name ?? m.email })),
              roles: roles.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, color: r.color, memberIds: r.members.map((m) => m.id) })),
              myRoleIds: roleIds,
              pages: tree.map((p) => ({ id: p.id, title: p.title || "Untitled", icon: p.icon })),
              categories: TASK_CATEGORIES,
              me: user.id,
              canEdit: can(abilities, "manage_tasks"),
            },
          };
        }
        default:
          return { ...base, items: [] };
      }
    }),
  );

  const hour = new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Los_Angeles" });
  const greeting = +hour < 12 ? "Good morning" : +hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex items-center gap-3">
        <span className="text-3xl md:text-4xl">{workspace.icon}</span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {greeting}, {(user.name ?? "").split(" ")[0] || "there"}
          </h1>
          <p className="text-sm text-ink-soft">
            {workspace.name} · {today}
          </p>
        </div>
      </div>
      <Dashboard
        slug={slug}
        widgets={data}
        stats={stats}
        canCustomize={can(abilities, "manage_dashboard")}
        catalog={WIDGET_CATALOG}
        allPages={tree.map((p) => ({ id: p.id, title: p.title || "Untitled", icon: p.icon }))}
      />
    </div>
  );
}
