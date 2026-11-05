import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listTasks } from "@/lib/services/tasks";
import { listMembers } from "@/lib/services/members";
import { listTree } from "@/lib/services/pages";
import { TASK_CATEGORIES } from "@/db/schema";
import { TasksView } from "@/components/tasks/TasksView";

export default async function TasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, role } = await requireWorkspacePage(slug);
  const [tasks, { members }, tree] = await Promise.all([listTasks(workspace.id), listMembers(workspace.id), listTree(workspace.id)]);
  return (
    <TasksView
      slug={slug}
      tasks={tasks}
      members={members.map((m) => ({ id: m.userId, name: m.name ?? m.email }))}
      pages={tree.map((p) => ({ id: p.id, title: p.title || "Untitled", icon: p.icon }))}
      categories={TASK_CATEGORIES}
      me={user.id}
      canEdit={can(role, "edit")}
    />
  );
}
