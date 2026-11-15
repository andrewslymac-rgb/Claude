import { notFound } from "next/navigation";
import { Wrench } from "lucide-react";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listLinks, listStars, withStars } from "@/lib/tool-links";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolLinks } from "@/components/ToolLinks";

export const dynamic = "force-dynamic";

/** Owners' and admins' links to outside tools (e.g. the Schedule Planner) and reports. */
export default async function ToolsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, abilities, user } = await requireWorkspacePage(slug);
  if (!can(abilities, "view_dashboards")) notFound();
  const stars = await listStars(user.id, workspace.id);
  const [tools, reports] = await Promise.all([listLinks(workspace.id, "tools"), listLinks(workspace.id, "reports")]);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <PageHeader eyebrow={workspace.name} title="Tools and reports" icon={<Wrench size={22} className="text-accent" />} subtitle="Links to outside tools and reports. They open in a new tab and appear in the menu for owners and admins." />
      <section id="tools" className="space-y-2">
        <h2 className="section-title">Tools</h2>
        <ToolLinks slug={slug} links={withStars(tools, stars)} kind="tools" />
      </section>
      <section id="reports" className="space-y-2">
        <h2 className="section-title">Reports</h2>
        <ToolLinks slug={slug} links={withStars(reports, stars)} kind="reports" />
      </section>
    </div>
  );
}
