import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listWidgetsFor, WIDGET_CATALOG, KNOWN_APP_LINKS, ensureTrackerWidget } from "@/lib/services/dashboard";
import { getPagesByIds, listRecent, listSops, listTree, listLibrary, listChangeLog } from "@/lib/services/pages";
import { Dashboard, type WidgetData, type Stat } from "@/components/dashboard/Dashboard";
import { listTasks, tasksForUser } from "@/lib/services/tasks";
import { listFlags } from "@/lib/services/flags";
import { countPending, listProposals } from "@/lib/services/ai-proposals";
import { reviewState, todayISO } from "@/lib/recurrence";
import { collectionCounts, listCollections } from "@/lib/drive/sync";
import { getIntegration, MANUAL_TOKEN } from "@/lib/integrations/jobber";
import { listMembers } from "@/lib/services/members";
import { listRoles } from "@/lib/services/roles";
import { teamOverview } from "@/lib/services/team";
import { listFeedback } from "@/lib/services/feedback";
import { googleCalendarEnabled, listConnections } from "@/lib/calendar";
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
  const [{ widgets, personal }, tree, allTasks, flags, library, collections, counts, jobber, pendingAi] = await Promise.all([
    listWidgetsFor(workspace.id, user.id),
    listTree(workspace.id),
    listTasks(workspace.id),
    listFlags(workspace.id),
    listLibrary(workspace.id),
    listCollections(workspace.id),
    collectionCounts(workspace.id),
    workspace.fieldTool === "none" ? Promise.resolve(null) : getIntegration(workspace.id, workspace.fieldTool),
    countPending(workspace.id),
  ]);
  const todayStr = todayISO();
  const twoDaysAgo = new Date(Date.now() - 2 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const overdue = allTasks.filter((t) => t.state === "overdue").length;
  const dueToday = allTasks.filter((t) => t.state === "today").length;
  const openFlags = flags.filter((f) => f.status === "open");
  const reviewsDue = library.filter((d) => ["overdue", "due_soon", "first"].includes(reviewState(d.reviewCycle, d.lastReviewedOn)));
  const followUps = allTasks.filter((t) => t.followUpOn && t.followUpOn <= todayStr);
  const isAdmin = can(abilities, "manage_members");

  const stats: Stat[] = [
    { key: "overdue", label: "Overdue tasks", value: overdue, href: `/w/${slug}/tasks`, tone: overdue ? "danger" : "ok" },
    { key: "today", label: "Due today", value: dueToday, href: `/w/${slug}/tasks`, tone: dueToday ? "warn" : "ok" },
    { key: "followups", label: "Follow-ups due", value: followUps.length, href: `/w/${slug}/tasks`, tone: followUps.length ? "warn" : "ok" },
    { key: "flags", label: "Open flags", value: openFlags.length, href: `/w/${slug}/flags`, tone: openFlags.length ? "warn" : "ok" },
    { key: "reviews", label: "Reviews due", value: reviewsDue.length, href: `/w/${slug}/library`, tone: reviewsDue.length ? "accent" : "ok" },
    { key: "ai", label: "AI awaiting approval", value: pendingAi, href: `/w/${slug}/ai`, tone: pendingAi ? "accent" : "muted" },
  ];

  // Each widget loads on its own: one broken data source shows an error in its tile, not a blank page.
  const data: WidgetData[] = await Promise.all(
    widgets.map(async (w): Promise<WidgetData> => {
      const config = w.type === "tools" && w.config.links ? { ...w.config, links: w.config.links.map((l) => ({ ...l, appUrl: l.appUrl || KNOWN_APP_LINKS[safeHost(l.url)] })) } : w.config;
      const base: WidgetData = { id: w.id, type: w.type, title: w.title, width: w.width, config, items: [] };
      const limit = w.config.limit ?? 6;
      try {
        switch (w.type) {
          case "recent":
            return { ...base, items: (await listRecent(workspace.id, limit)).map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })) };
          case "sops":
            return { ...base, items: (await listSops(workspace.id, limit)).map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })) };
          case "pages":
            return { ...base, items: await getPagesByIds(workspace.id, w.config.pageIds ?? []) };
          case "tasks": {
            const mine = tasksForUser(allTasks, user.id, roleIds).filter((t) => t.state === "overdue" || t.state === "today" || (t.state === "soon" && !(t.lastDoneOn && t.lastDoneOn >= twoDaysAgo)));
            return { ...base, total: mine.length, items: mine.slice(0, limit).map((t) => ({ id: t.id, title: t.title, icon: null, state: t.state, nextDueOn: t.nextDueOn })) };
          }
          case "followups":
            return { ...base, total: followUps.length, items: followUps.slice(0, limit).map((t) => ({ id: t.id, title: t.title, icon: null, nextDueOn: t.followUpOn, subtitle: t.followUpNote ?? undefined, state: t.followUpOn! < todayStr ? "overdue" : "today" })) };
          case "reviews":
            return { ...base, total: reviewsDue.length, items: reviewsDue.slice(0, limit).map((d) => ({ id: d.id, title: d.title, icon: d.icon, review: reviewState(d.reviewCycle, d.lastReviewedOn) })) };
          case "flags":
            return { ...base, total: openFlags.length, items: openFlags.slice(0, limit).map((f) => ({ id: f.id, title: f.title, icon: null, state: f.severity })) };
          case "collections":
            return { ...base, items: collections.map((c) => ({ id: c.id, title: c.label, icon: c.icon, count: counts.get(c.id) ?? 0, kind: c.kind })) };
          case "jobber":
            return { ...base, connected: Boolean(jobber), manual: jobber?.accessToken === MANUAL_TOKEN, fieldTool: workspace.fieldTool };
          case "changelog":
            return { ...base, items: (await listChangeLog(workspace.id, limit)).map((l) => ({ id: l.id, pageId: l.pageId, title: l.note ?? "", icon: l.pageIcon, subtitle: l.pageTitle, updatedAt: l.createdAt.toISOString(), updatedBy: l.actorType === "ai" ? "Claude" : l.actorName, state: l.teamTold ? "told" : "not_told" })) };
          case "team": {
            const people = (await teamOverview(workspace.id)).filter((p) => p.total > 0 || p.done30 > 0).sort((a, b) => b.overdue - a.overdue || a.onTrack - b.onTrack);
            return { ...base, total: people.length, items: people.slice(0, limit).map((p) => ({ id: p.userId, title: p.name, icon: null, count: p.onTrack, state: p.overdue ? "overdue" : "ok", subtitle: `${p.overdue} overdue · ${p.doneThisWeek} done this week` })) };
          }
          case "feedback": {
            if (!isAdmin) return { ...base, hidden: true };
            const fb = (await listFeedback(workspace.id)).filter((f) => f.status === "new");
            return { ...base, total: fb.length, items: fb.slice(0, limit).map((f) => ({ id: f.id, title: f.body, icon: null, state: f.kind, subtitle: f.by ?? f.byEmail ?? undefined, updatedAt: f.createdAt.toISOString() })) };
          }
          case "ai": {
            const props = await listProposals(workspace.id, "pending");
            return { ...base, total: props.length, items: props.slice(0, limit).map((p) => ({ id: p.id, title: p.title ?? p.pageTitle ?? "New page", icon: p.pageIcon ?? "🤖", subtitle: p.reason })) };
          }
          case "calendar":
            return { ...base, connected: (await listConnections(user.id)).length > 0 };
          case "notes":
            return { ...base, config: { ...config, text: config.notesBy?.[user.id] ?? "" } };
          case "tracker": {
            const [{ members }, roles] = await Promise.all([listMembers(workspace.id), listRoles(workspace.id)]);
            return {
              ...base,
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
            return base;
        }
      } catch (e) {
        console.error(`Dashboard widget ${w.type} failed`, e);
        return { ...base, error: (e as Error).message.slice(0, 160) || "Couldn't load this tile." };
      }
    }),
  );

  const hour = +new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Los_Angeles" });
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
  const firstName = user.firstName || (user.name ?? "").split(" ")[0] || "there";

  return (
    <div className="page">
      <div className="flex items-center gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl md:h-14 md:w-14 md:text-3xl" style={{ background: `${workspace.color}33`, boxShadow: `inset 0 0 0 1px ${workspace.color}66` }}>
          {workspace.icon}
        </span>
        <div className="min-w-0">
          <div className="eyebrow">{today}</div>
          <h1 className="page-title">
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-ink-soft">
            {workspace.name}
            {overdue > 0 || dueToday > 0 ? ` · ${[overdue && `${overdue} overdue`, dueToday && `${dueToday} due today`].filter(Boolean).join(", ")}` : " · nothing overdue"}
          </p>
        </div>
      </div>
      <Dashboard
        slug={slug}
        widgets={data.filter((w) => !w.hidden)}
        stats={stats}
        personal={personal}
        canPublish={can(abilities, "manage_dashboard")}
        isAdmin={isAdmin}
        catalog={WIDGET_CATALOG}
        allPages={tree.map((p) => ({ id: p.id, title: p.title || "Untitled", icon: p.icon }))}
        googleCalendar={googleCalendarEnabled()}
      />
    </div>
  );
}
