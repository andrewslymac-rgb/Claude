import { requireWorkspacePage } from "@/lib/access";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { listMembers } from "@/lib/services/members";
import { MembersPanel } from "@/components/settings/MembersPanel";
import { WorkspaceForm } from "@/components/settings/WorkspaceForm";

export default async function Settings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, role } = await requireWorkspacePage(slug);
  const { members, pending } = await listMembers(workspace.id);

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">
          You are {ROLE_LABELS[role].label === "Admin" || ROLE_LABELS[role].label === "Owner" ? "an" : "a"} <strong>{ROLE_LABELS[role].label}</strong> in this workspace.
        </p>
      </div>

      {can(role, "manage_workspace") && (
        <section>
          <h2 className="text-lg font-semibold">Workspace</h2>
          <WorkspaceForm slug={slug} name={workspace.name} icon={workspace.icon} color={workspace.color} />
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">People</h2>
        <MembersPanel
          slug={slug}
          myRole={role}
          myId={user.id}
          canManage={can(role, "manage_members")}
          members={members.map((m) => ({ ...m, lastSeenAt: m.lastSeenAt?.toISOString() ?? null }))}
          pending={pending.map((p) => ({ id: p.id, email: p.email, role: p.role }))}
          roles={ROLE_LABELS}
        />
      </section>
    </div>
  );
}
