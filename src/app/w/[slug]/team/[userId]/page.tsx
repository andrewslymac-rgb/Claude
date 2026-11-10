import { notFound, redirect } from "next/navigation";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { personDetail } from "@/lib/services/team";
import { PersonView } from "@/components/team/PersonView";

export default async function PersonPage({ params }: { params: Promise<{ slug: string; userId: string }> }) {
  const { slug, userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();
  const { user, workspace, abilities } = await requireWorkspacePage(slug);
  const canManage = can(abilities, "manage_tasks");
  if (!canManage && userId !== user.id) redirect(`/w/${slug}/team/${user.id}`);
  const d = await personDetail(workspace.id, userId);
  if (!d) notFound();
  return <PersonView slug={slug} {...d} canManage={canManage} isMe={userId === user.id} />;
}
