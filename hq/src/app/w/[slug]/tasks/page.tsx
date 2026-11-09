import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listTasks } from "@/lib/services/tasks";
import { listMembers } from "@/lib/services/members";
import { listRoles } from "@/lib/services/roles";
import { listTree } from "@/lib/services/pages";
import { TASK_CATEGORIES } from "@/db/schema";
import { Tracker } from "@/components/tasks/Tracker";

export default async function TasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, abilities, roleIds } = await requireWorkspacePage(slug);
  const [tasks, { members }, tree, roles] = await Promise.all([listTasks(workspace.id), listMembers(workspace.id), listTree(workspace.id), listRoles(workspace.id)]);
  return (
    <Tracker
      mode="full"
      slug={slug}
      tasks={tasks}
      members={members.map((m) => ({ id: m.userId, name: m.name ?? m.email }))}
      roles={roles.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, color: r.color, memberIds: r.members.map((m) => m.id) }))}
      myRoleIds={roleIds}
      pages={tree.map((p) => ({ id: p.id, title: p.title || "Untitled", icon: p.icon }))}
      categories={TASK_CATEGORIES}
      me={user.id}
      canEdit={can(abilities, "manage_tasks")}
    />
  );
}
