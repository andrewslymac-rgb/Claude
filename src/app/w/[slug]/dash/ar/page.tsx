import { notFound } from "next/navigation";
import { dashboardPage } from "@/lib/dash/access";
import { arBoard, listFollowups } from "@/lib/dash/ar";
import { ArBoardView } from "@/components/dash/ArBoardView";

export const dynamic = "force-dynamic";

export default async function ArPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ refresh?: string }> }) {
  const { slug } = await params;
  const { refresh } = await searchParams;
  const { user, workspace } = await dashboardPage(slug);
  if (workspace.fieldTool !== "jobber") notFound();
  const [board, followups] = await Promise.all([arBoard(workspace, refresh === "1"), listFollowups(workspace.id)]);
  return <ArBoardView slug={slug} board={board} followups={followups} signOff={user.firstName || user.name?.split(" ")[0] || ""} />;
}
