import { Link2 } from "lucide-react";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listLinks } from "@/lib/tool-links";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolLinks } from "@/components/ToolLinks";

export const dynamic = "force-dynamic";

/** Websites the team uses. Everyone in the company sees them; owners and admins add and remove. */
export default async function LinksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, abilities } = await requireWorkspacePage(slug);
  const links = await listLinks(workspace.id, "links");
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <PageHeader eyebrow={workspace.name} title="Links" icon={<Link2 size={22} className="text-accent" />} subtitle="Websites the team uses. Paste in an address and give it a name. They open in a new tab and appear in the menu for everyone in this company." />
      <ToolLinks slug={slug} links={links} kind="links" canManage={can(abilities, "view_dashboards")} />
    </div>
  );
}
