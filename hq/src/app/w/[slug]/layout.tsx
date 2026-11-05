import { requireWorkspacePage, listWorkspacesForUser } from "@/lib/access";
import { listTree } from "@/lib/services/pages";
import { can } from "@/lib/permissions";
import { Sidebar } from "@/components/Sidebar";
import { listTasks } from "@/lib/services/tasks";
import { listFlags } from "@/lib/services/flags";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, role } = await requireWorkspacePage(slug);
  const [tree, workspaces, tasks, flags] = await Promise.all([listTree(workspace.id), listWorkspacesForUser(user), listTasks(workspace.id), listFlags(workspace.id)]);
  const attention = tasks.filter((t) => t.state === "overdue" || t.state === "today").length;
  const openFlags = flags.filter((f) => f.status === "open").length;

  return (
    <div className="flex h-screen overflow-hidden" style={{ ["--ws-accent" as string]: workspace.color }}>
      <Sidebar
        workspace={{ slug: workspace.slug, name: workspace.name, icon: workspace.icon, color: workspace.color }}
        workspaces={workspaces.map((w) => ({ slug: w.slug, name: w.name, icon: w.icon, color: w.color }))}
        tree={tree}
        user={{ name: user.name ?? user.email, email: user.email, isAppAdmin: user.isAppAdmin }}
        canEdit={can(role, "edit")}
        canManage={can(role, "manage_members")}
        attention={attention}
        openFlags={openFlags}
      />
      <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
    </div>
  );
}
