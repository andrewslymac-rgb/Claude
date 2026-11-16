import { BarChart3 } from "lucide-react";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listLinks, listStars, withStars } from "@/lib/tool-links";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolLinks } from "@/components/ToolLinks";

export const dynamic = "force-dynamic";

/** Every report link with its description. Everyone in the company sees them; owners and admins add, edit and remove. */
export default async function ReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, abilities, user } = await requireWorkspacePage(slug);
  const reports = withStars(await listLinks(workspace.id, "reports"), await listStars(user.id, workspace.id));
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <PageHeader eyebrow={workspace.name} title="Reports" icon={<BarChart3 size={22} className="text-accent" />} subtitle="Reports and trackers you check. Star the ones you use most to keep them in your menu." />
      <ToolLinks slug={slug} links={reports} kind="reports" canManage={can(abilities, "view_dashboards")} />
    </div>
  );
}
