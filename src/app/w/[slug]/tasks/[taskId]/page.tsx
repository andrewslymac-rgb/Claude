import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { getTask } from "@/lib/services/tasks";
import { listMembers } from "@/lib/services/members";
import { listRoles } from "@/lib/services/roles";
import { listTree } from "@/lib/services/pages";
import { TASK_CATEGORIES } from "@/db/schema";
import { TaskPageView } from "@/components/tasks/TaskPageView";

export const dynamic = "force-dynamic";

/** A task's own page: everything about it, openable from anywhere in Orbit. */
export default async function TaskPage({ params }: { params: Promise<{ slug: string; taskId: string }> }) {
  const { slug, taskId } = await params;
  const { workspace, abilities } = await requireWorkspacePage(slug);
  if (!z.string().uuid().safeParse(taskId).success) notFound();
  const [task, { members }, tree, roles] = await Promise.all([getTask(workspace.id, taskId), listMembers(workspace.id), listTree(workspace.id), listRoles(workspace.id)]);
  if (!task) notFound();
  return (
    <TaskPageView
      slug={slug}
      task={task}
      members={members.map((m) => ({ id: m.userId, name: m.name ?? m.email }))}
      roles={roles.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, color: r.color }))}
      pages={tree.map((p) => ({ id: p.id, title: p.title || "Untitled", icon: p.icon }))}
      categories={TASK_CATEGORIES}
      canEdit={can(abilities, "manage_tasks")}
    />
  );
}
