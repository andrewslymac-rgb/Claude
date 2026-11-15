import { notFound } from "next/navigation";
import { Wrench } from "lucide-react";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listLinks, listStars, withStars } from "@/lib/tool-links";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolLinks } from "@/components/ToolLinks";

export const dynamic = "force-dynamic";

/** Every tool link with its description. Owners and admins only. */
export default async function ToolsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, abilities, user } = await requireWorkspacePage(slug);
  if (!can(abilities, "view_dashboards")) notFound();
  const tools = withStars(await listLinks(workspace.id, "tools"), await listStars(user.id, workspace.id));
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <PageHeader eyebrow={workspace.name} title="Tools" icon={<Wrench size={22} className="text-accent" />} subtitle="Outside tools the business runs on. Star the ones you use most to keep them in your menu." />
      <ToolLinks slug={slug} links={tools} kind="tools" />
    </div>
  );
}
