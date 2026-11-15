import { Link2 } from "lucide-react";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listLinks, listStars, withStars } from "@/lib/tool-links";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolLinks } from "@/components/ToolLinks";

export const dynamic = "force-dynamic";

/** Websites and documents the team uses. Everyone in the company sees them; owners and admins add and remove. */
export default async function LinksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, abilities, user } = await requireWorkspacePage(slug);
  const stars = await listStars(user.id, workspace.id);
  const [sites, docs] = await Promise.all([listLinks(workspace.id, "links"), listLinks(workspace.id, "docs")]);
  const canManage = can(abilities, "view_dashboards");
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <PageHeader eyebrow={workspace.name} title="Quick Links" icon={<Link2 size={22} className="text-accent" />} subtitle="Websites and documents the team uses. Paste in an address and give it a name. They open in a new tab and appear in the menu for everyone in this company." />
      <section className="space-y-2">
        <h2 className="section-title">Documents</h2>
        <ToolLinks slug={slug} links={withStars(docs, stars)} kind="docs" canManage={canManage} />
      </section>
      <section className="space-y-2">
        <h2 className="section-title">Websites</h2>
        <ToolLinks slug={slug} links={withStars(sites, stars)} kind="links" canManage={canManage} />
      </section>
    </div>
  );
}
