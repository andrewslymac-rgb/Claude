import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listActivity } from "@/lib/services/ai-auth";
import { listProposals } from "@/lib/services/ai-proposals";
import { AiHub } from "@/components/ai/AiHub";

export default async function AiActivityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const { workspace, role, abilities } = await requireWorkspacePage(slug);
  const [items, props] = await Promise.all([listActivity(workspace.id), listProposals(workspace.id)]);
  return (
    <AiHub
      slug={slug}
      tab={tab === "activity" ? "activity" : "approvals"}
      activity={items.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), undoneAt: a.undoneAt?.toISOString() ?? null }))}
      proposals={props.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), reviewedAt: p.reviewedAt?.toISOString() ?? null }))}
      canUndo={can(abilities, "edit")}
      canReview={can(abilities, "manage_dashboard")}
    />
  );
}
