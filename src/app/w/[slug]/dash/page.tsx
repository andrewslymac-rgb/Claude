import Link from "next/link";
import { ChevronRight, LayoutDashboard, Receipt, Wrench } from "lucide-react";
import { dashboardPage } from "@/lib/dash/access";
import { screensFor } from "@/lib/dash/screens";
import { listToolLinks } from "@/lib/dash/tools";
import { PageHeader } from "@/components/ui/PageHeader";
import { UnlockGate } from "@/components/dash/UnlockGate";
import { ToolLinks } from "@/components/dash/ToolLinks";
import { LockButton } from "@/components/dash/LockButton";

export const dynamic = "force-dynamic";

export default async function DashboardsHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, unlocked } = await dashboardPage(slug);
  if (!unlocked) return <UnlockGate slug={slug} email={user.email} />;
  const screens = screensFor(workspace.fieldTool);
  const tools = await listToolLinks(workspace.id);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 md:px-8 md:py-10">
      <PageHeader eyebrow="Owners and admins only" title="Dashboards" icon={<LayoutDashboard size={22} className="text-accent" />} subtitle={`Live views of ${workspace.name}'s numbers. Read-only: Jobber and GorillaDesk stay the source of truth.`} actions={<LockButton slug={slug} />} />

      <section>
        <h2 className="eyebrow mb-2">Dashboards</h2>
        {screens.length ? (
          <div className="card divide-y divide-line">
            {screens.map((s) => (
              <Link key={s.id} href={`/w/${slug}/dash/${s.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-hover">
                <span className="text-accent"><Receipt size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.label}</span>
                  <span className="block text-xs text-ink-soft">{s.help}</span>
                </span>
                <ChevronRight size={16} className="text-ink-faint" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="card px-4 py-6 text-sm text-ink-soft">No dashboards for this company yet. They&apos;re being added one at a time.</p>
        )}
      </section>

      <section>
        <h2 className="eyebrow mb-2 flex items-center gap-1"><Wrench size={11} /> Tools</h2>
        <ToolLinks slug={slug} links={tools} />
      </section>
    </div>
  );
}
