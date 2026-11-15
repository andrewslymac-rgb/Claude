import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listMeetings, listSources, sharedSeries } from "@/lib/meetings/service";
import { serviceAccountStatus } from "@/lib/drive/client";
import { MeetingsView } from "@/components/meetings/MeetingsView";

export const dynamic = "force-dynamic";

export default async function MeetingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, abilities } = await requireWorkspacePage(slug);
  const isAdmin = can(abilities, "view_dashboards");
  const [ms, sources, shared, sa] = await Promise.all([listMeetings(workspace.id, isAdmin), isAdmin ? listSources(workspace.id) : Promise.resolve([]), sharedSeries(workspace.id), isAdmin ? serviceAccountStatus() : Promise.resolve(null)]);
  return (
    <MeetingsView
      slug={slug}
      company={workspace.name}
      isAdmin={isAdmin}
      canMakeTasks={can(abilities, "manage_tasks")}
      orbitDriveEmail={sa?.state === "ok" ? sa.email : null}
      sources={sources.map((s) => ({ id: s.id, label: s.label, folderId: s.folderId, lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null, lastError: s.lastError }))}
      shared={shared}
      meetings={ms.map((m) => ({
        id: m.id,
        series: m.series,
        at: m.occurredAt.toISOString(),
        docUrl: m.docUrl,
        attendees: m.attendees,
        summary: m.summary,
        points: m.summaryPoints,
        decisions: m.decisions,
        nextSteps: m.nextSteps,
        topics: m.topics,
        recognised: m.recognised,
      }))}
    />
  );
}
