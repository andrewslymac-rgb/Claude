import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { getMeeting } from "@/lib/meetings/service";
import { MeetingDetail } from "@/components/meetings/MeetingDetail";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { workspace, abilities } = await requireWorkspacePage(slug);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const m = await getMeeting(workspace.id, id, can(abilities, "view_dashboards"));
  if (!m) notFound();
  return (
    <MeetingDetail
      slug={slug}
      canMakeTasks={can(abilities, "manage_tasks")}
      m={{ id: m.id, series: m.series, at: m.occurredAt.toISOString(), docUrl: m.docUrl, attendees: m.attendees, summary: m.summary, points: m.summaryPoints, decisions: m.decisions, nextSteps: m.nextSteps, topics: m.topics, recognised: m.recognised }}
    />
  );
}
