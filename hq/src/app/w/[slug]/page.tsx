import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listWidgets, WIDGET_CATALOG } from "@/lib/services/dashboard";
import { getPagesByIds, listRecent, listSops, listTree } from "@/lib/services/pages";
import { Dashboard, type WidgetData } from "@/components/dashboard/Dashboard";

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
        default:
          return { ...base, items: [] };
      }
    }),
  );

  const hour = new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Los_Angeles" });
  const greeting = +hour < 12 ? "Good morning" : +hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">
      <div className="flex items-center gap-3">
        <span className="text-4xl">{workspace.icon}</span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
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
