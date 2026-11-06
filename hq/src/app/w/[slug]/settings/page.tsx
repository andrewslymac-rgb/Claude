import { requireWorkspacePage } from "@/lib/access";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { listMembers } from "@/lib/services/members";
import { MembersPanel } from "@/components/settings/MembersPanel";
import { WorkspaceForm } from "@/components/settings/WorkspaceForm";
import { AiAccessPanel } from "@/components/settings/AiAccessPanel";
import { listGrants, SCOPE_LABELS } from "@/lib/services/ai-auth";
import { appUrl } from "@/lib/oauth-meta";

export default async function Settings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, role } = await requireWorkspacePage(slug);
  const { members, pending } = await listMembers(workspace.id);
  const grants = can(role, "manage_members") ? await listGrants(workspace.id) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 md:space-y-10 md:px-10 md:py-10">
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

      {can(role, "manage_members") && (
        <section>
          <h2 className="text-lg font-semibold">AI access</h2>
          <AiAccessPanel
            slug={slug}
            grants={grants.map((g) => ({ ...g, createdAt: g.createdAt.toISOString(), lastUsedAt: g.lastUsedAt?.toISOString() ?? null, revokedAt: g.revokedAt?.toISOString() ?? null }))}
            scopeInfo={Object.entries(SCOPE_LABELS).map(([key, v]) => ({ key, ...v }))}
            mcpUrl={`${appUrl()}/api/mcp`}
          />
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
