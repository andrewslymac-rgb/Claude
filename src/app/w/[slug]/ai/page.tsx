import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listActivity } from "@/lib/services/ai-auth";
import { ActivityView } from "@/components/ai/ActivityView";

export default async function AiActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireWorkspacePage(slug);
  const items = await listActivity(workspace.id);
  return <ActivityView slug={slug} items={items.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), undoneAt: a.undoneAt?.toISOString() ?? null }))} canUndo={can(role, "edit")} />;
}
