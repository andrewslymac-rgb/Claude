import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { hasPin, peekLocked, UNLOCK_MINUTES } from "@/lib/locked-links";
import { PageHeader } from "@/components/ui/PageHeader";
import { LockedLinks } from "@/components/LockedLinks";

export const dynamic = "force-dynamic";
export const metadata = { title: "Locked Links · Orbit" };

/** A private list of links behind a PIN. Each owner or admin has their own; nobody else can open it. */
export default async function LockedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, abilities, user } = await requireWorkspacePage(slug);
  if (!can(abilities, "view_dashboards")) notFound();
  const [pinSet, links] = await Promise.all([hasPin(user.id), peekLocked(workspace.id, user.id)]);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <PageHeader eyebrow={workspace.name} title="Locked Links" icon={<Lock size={22} className="text-accent" />} subtitle="Private links only you can open, behind your PIN. They are not shared with the team, not in search and not visible to AI tools." />
      <LockedLinks slug={slug} pinSet={pinSet} links={links} minutes={UNLOCK_MINUTES} />
    </div>
  );
}
