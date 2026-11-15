import { notFound } from "next/navigation";
import { Wrench } from "lucide-react";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listToolLinks } from "@/lib/tool-links";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolLinks } from "@/components/ToolLinks";

export const dynamic = "force-dynamic";

/** Owners' and admins' tool links (e.g. the Schedule Planner). Not behind the dashboard code. */
export default async function ToolsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, abilities } = await requireWorkspacePage(slug);
  if (!can(abilities, "view_dashboards")) notFound();
  const tools = await listToolLinks(workspace.id);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <PageHeader eyebrow={workspace.name} title="Tools and reports" icon={<Wrench size={22} className="text-accent" />} subtitle="Links to outside tools and reports, like the Schedule Planner. They open in a new tab and also appear in the menu." />
      <ToolLinks slug={slug} links={tools} kind="tools" />
    </div>
  );
}
