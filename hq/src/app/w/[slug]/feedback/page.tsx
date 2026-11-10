import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listFeedback } from "@/lib/services/feedback";
import { FeedbackView } from "@/components/feedback/FeedbackView";

export default async function FeedbackPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string }> }) {
  const { slug } = await params;
  const { from } = await searchParams;
  const { user, workspace, abilities } = await requireWorkspacePage(slug);
  const rows = await listFeedback(workspace.id);
  return (
    <FeedbackView
      slug={slug}
      me={user.id}
      canManage={can(abilities, "manage_members")}
      fromPath={from ?? null}
      items={rows.map((r) => ({ ...r, by: r.by ?? r.byEmail ?? null, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }))}
    />
  );
}
