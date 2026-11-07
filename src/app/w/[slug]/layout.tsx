import { requireWorkspacePage, listWorkspacesForUser } from "@/lib/access";
import { listTree } from "@/lib/services/pages";
import { can } from "@/lib/permissions";
import { Sidebar } from "@/components/Sidebar";
import { MobileShell } from "@/components/MobileShell";
import { listTasks } from "@/lib/services/tasks";
import { listFlags } from "@/lib/services/flags";
import { countPending } from "@/lib/services/ai-proposals";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, role } = await requireWorkspacePage(slug);
  const [tree, workspaces, tasks, flags, pendingAi] = await Promise.all([listTree(workspace.id), listWorkspacesForUser(user), listTasks(workspace.id), listFlags(workspace.id), countPending(workspace.id)]);
  const attention = tasks.filter((t) => t.state === "overdue" || t.state === "today").length;
  const openFlags = flags.filter((f) => f.status === "open").length;

  return (
    // The company's color becomes the accent for everything inside it: buttons, active
    // links, badges, the icon tile. Lightened a touch so it reads well on the dark theme.
    <div
      style={{
        ["--ws-accent" as string]: workspace.color,
        ["--color-accent" as string]: `color-mix(in oklab, ${workspace.color} 72%, white)`,
        ["--color-accent-soft" as string]: `color-mix(in srgb, ${workspace.color} 22%, transparent)`,
      }}
    >
      <MobileShell title={workspace.name} icon={workspace.icon} sidebar={
      <Sidebar
        workspace={{ slug: workspace.slug, name: workspace.name, icon: workspace.icon, color: workspace.color }}
        workspaces={workspaces.map((w) => ({ slug: w.slug, name: w.name, icon: w.icon, color: w.color }))}
        tree={tree}
        user={{ name: user.name ?? user.email, email: user.email, isAppAdmin: user.isAppAdmin }}
        canEdit={can(role, "edit")}
        canManage={can(role, "manage_members")}
        attention={attention}
        openFlags={openFlags}
        pendingAi={pendingAi}
      />
      }>
        {children}
      </MobileShell>
    </div>
  );
}
