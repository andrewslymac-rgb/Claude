import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { getMeeting, peopleMap, stepStatuses } from "@/lib/meetings/service";
import { listMembers } from "@/lib/services/members";
import { MeetingDetail } from "@/components/meetings/MeetingDetail";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { workspace, abilities } = await requireWorkspacePage(slug);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const m = await getMeeting(workspace.id, id, can(abilities, "view_dashboards"));
  if (!m) notFound();
  const status = (await stepStatuses([m])).get(m.id) ?? [];
  const canMakeTasks = can(abilities, "manage_tasks");
  const [{ members }, people] = canMakeTasks ? await Promise.all([listMembers(workspace.id), peopleMap(workspace.id)]) : [{ members: [] }, new Map<string, string | null>()];
  const suggest = Object.fromEntries([...people].filter(([, v]) => v) as [string, string][]);
  return (
    <MeetingDetail
      slug={slug}
      canMakeTasks={canMakeTasks}
      isAdmin={can(abilities, "view_dashboards")}
      team={members.map((p) => ({ id: p.userId, name: p.name ?? p.email }))}
      suggest={suggest}
      m={{ id: m.id, series: m.series, at: m.occurredAt.toISOString(), docUrl: m.docUrl, platform: m.platform, transcript: m.transcript, attendees: m.attendees, summary: m.summary, points: m.summaryPoints, decisions: m.decisions, nextSteps: m.nextSteps, topics: m.topics, recognised: m.recognised, status }}
    />
  );
}
