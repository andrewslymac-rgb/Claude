import { redirect } from "next/navigation";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { teamOverview } from "@/lib/services/team";
import { TeamView } from "@/components/team/TeamView";

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, abilities } = await requireWorkspacePage(slug);
  // People who don't manage tasks see only their own page.
  if (!can(abilities, "manage_tasks")) redirect(`/w/${slug}/team/${user.id}`);
  return <TeamView slug={slug} people={await teamOverview(workspace.id)} />;
}
