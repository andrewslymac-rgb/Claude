import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { autoTasksFrom, listMeetings, listSources, namesInMeetings, peopleMap, sharedSeries, stepStatuses } from "@/lib/meetings/service";
import { listMembers } from "@/lib/services/members";
import { serviceAccountStatus } from "@/lib/drive/client";
import { MeetingsView } from "@/components/meetings/MeetingsView";
import { aiEnabled } from "@/lib/meetings/ask";

export const dynamic = "force-dynamic";

export default async function MeetingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, abilities } = await requireWorkspacePage(slug);
  const isAdmin = can(abilities, "view_dashboards");
  const [ms, sources, shared, sa] = await Promise.all([listMeetings(workspace.id, isAdmin), isAdmin ? listSources(workspace.id) : Promise.resolve([]), sharedSeries(workspace.id), isAdmin ? serviceAccountStatus() : Promise.resolve(null)]);
  const [statuses, names, map, auto, { members }] = await Promise.all([stepStatuses(ms), isAdmin ? namesInMeetings(workspace.id) : Promise.resolve([]), isAdmin ? peopleMap(workspace.id) : Promise.resolve(new Map<string, string | null>()), isAdmin ? autoTasksFrom(workspace.id) : Promise.resolve(null), listMembers(workspace.id)]);
  return (
    <MeetingsView
      slug={slug}
      company={workspace.name}
      isAdmin={isAdmin}
      canMakeTasks={can(abilities, "manage_tasks")}
      orbitDriveEmail={sa?.state === "ok" ? sa.email : null}
      sources={sources.map((s) => ({ id: s.id, label: s.label, folderId: s.folderId, lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null, lastError: s.lastError }))}
      shared={shared}
      autoTasksFrom={auto}
      aiEnabled={aiEnabled()}
      team={members.map((m) => ({ id: m.userId, name: m.name ?? m.email }))}
      names={names.map((n) => ({ name: n.name, steps: n.steps, match: map.has(n.alias) ? map.get(n.alias) ?? "none" : "" }))}
      meetings={ms.map((m) => ({
        id: m.id,
        series: m.series,
        at: m.occurredAt.toISOString(),
        docUrl: m.docUrl,
        platform: m.platform,
        attendees: m.attendees,
        summary: m.summary,
        points: m.summaryPoints,
        decisions: m.decisions,
        nextSteps: m.nextSteps,
        topics: m.topics,
        recognised: m.recognised,
        status: statuses.get(m.id) ?? [],
      }))}
    />
  );
}
