import Link from "next/link";
import { notFound } from "next/navigation";
import { Wrench } from "lucide-react";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listToolLinks } from "@/lib/dash/tools";
import { builtInApps, toolLevel } from "@/lib/tools/apps";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolLinks } from "@/components/dash/ToolLinks";

export const dynamic = "force-dynamic";

/**
 * Tools. A company's built-in tools are listed for every member of that company.
 * The link shortcuts (e.g. the Schedule Planner) are still owners and admins only.
 */
export default async function ToolsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, abilities, role } = await requireWorkspacePage(slug);
  const apps = builtInApps(workspace.slug);
  const manageLinks = can(abilities, "view_dashboards");
  if (!manageLinks && !apps.length) notFound();
  const { canAdmin } = toolLevel(role);
  const tools = manageLinks ? await listToolLinks(workspace.id) : [];
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <PageHeader eyebrow={workspace.name} title="Tools" icon={<Wrench size={22} className="text-accent" />} subtitle={manageLinks ? "Tools built into Orbit, plus shortcuts to tools you use elsewhere." : "Tools built into Orbit for this company."} />
      {apps.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {apps.map((a) => (
            <div key={a.id} className="card flex flex-col gap-2 p-4">
              <Link href={`/w/${slug}/tools/${a.id}`} className="flex items-start gap-3">
                <span className="text-2xl">{a.emoji}</span>
                <span>
                  <span className="block font-semibold text-ink">{a.label}</span>
                  <span className="block text-sm text-ink-soft">{a.blurb}</span>
                </span>
              </Link>
              {canAdmin && (
                <Link href={`/w/${slug}/tools/${a.id}/import`} className="text-xs text-accent underline">
                  Import data (JSON)
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
      {manageLinks && <ToolLinks slug={slug} links={tools} />}
    </div>
  );
}
