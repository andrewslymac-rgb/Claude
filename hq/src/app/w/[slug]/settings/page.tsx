import Link from "next/link";
import { Building2, Users, FolderSync, Bot, Plug } from "lucide-react";
import { requireWorkspacePage } from "@/lib/access";
import { can, ROLE_LABELS, PERMISSION_LABELS } from "@/lib/permissions";
import { listRoles } from "@/lib/services/roles";
import { RolesPanel } from "@/components/settings/RolesPanel";
import type { Role } from "@/db/schema";
import { listMembers } from "@/lib/services/members";
import { NotificationsPanel } from "@/components/settings/NotificationsPanel";
import { MembersPanel } from "@/components/settings/MembersPanel";
import { WorkspaceForm } from "@/components/settings/WorkspaceForm";
import { AiAccessPanel } from "@/components/settings/AiAccessPanel";
import { listGrants, SCOPE_LABELS } from "@/lib/services/ai-auth";
import { appUrl } from "@/lib/oauth-meta";
import { DrivePanel } from "@/components/settings/DrivePanel";
import { ImportPanel } from "@/components/settings/ImportPanel";
import { collectionCounts, listCollections, KIND_INFO } from "@/lib/drive/sync";
import { serviceAccountStatus } from "@/lib/drive/client";
import { IntegrationsPanel } from "@/components/settings/IntegrationsPanel";
import { getIntegration, jobberAppConfig, redirectUri, MANUAL_TOKEN } from "@/lib/integrations/jobber";
import type { FieldTool } from "@/db/schema";

type Tab = "workspace" | "people" | "sync" | "integrations" | "ai";

export default async function Settings({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; ok?: string; error?: string }> }) {
  const { slug } = await params;
  const { tab: rawTab, ok, error } = await searchParams;
  const { user, workspace, role, abilities } = await requireWorkspacePage(slug);
  const admin = can(abilities, "manage_members");

  const tabs: { key: Tab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: "workspace" as Tab, label: "Workspace", icon: <Building2 size={15} />, show: can(abilities, "manage_workspace") },
    { key: "people" as Tab, label: "People", icon: <Users size={15} />, show: true },
    { key: "sync" as Tab, label: "Documents & sync", icon: <FolderSync size={15} />, show: admin },
    { key: "integrations" as Tab, label: "Integrations", icon: <Plug size={15} />, show: can(abilities, "manage_workspace") },
    { key: "ai" as Tab, label: "AI", icon: <Bot size={15} />, show: admin },
  ].filter((t) => t.show);
  const tab: Tab = tabs.some((t) => t.key === rawTab) ? (rawTab as Tab) : tabs[0].key;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-10">
      <div className="eyebrow mb-1.5">Company</div>
      <h1 className="page-title">Settings</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {workspace.icon} {workspace.name} · you are {ROLE_LABELS[role].label === "Admin" || ROLE_LABELS[role].label === "Owner" ? "an" : "a"} <strong>{ROLE_LABELS[role].label}</strong>
      </p>

      <nav className="mt-5 flex flex-wrap gap-1 border-b border-line pb-2">
        {tabs.map((t) => (
          <Link key={t.key} href={`/w/${slug}/settings?tab=${t.key}`} className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm md:py-1.5 ${tab === t.key ? "bg-hover font-medium text-ink" : "text-ink-soft hover:bg-hover"}`}>
            {t.icon} {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "workspace" && (
          <section>
            <h2 className="text-lg font-semibold">Name, icon, color and tools</h2>
            <p className="mt-1 text-sm text-ink-soft">How this company appears in the sidebar and on the hub, and which software it runs on.</p>
            <WorkspaceForm slug={slug} name={workspace.name} icon={workspace.icon} color={workspace.color} fieldTool={workspace.fieldTool} />
          </section>
        )}

        {tab === "people" && <PeopleTab slug={slug} workspaceId={workspace.id} role={role} canManage={can(abilities, "manage_members")} userId={user.id} />}

        {tab === "sync" && admin && (
          <div className="space-y-8">
            <section>
              <h2 className="text-lg font-semibold">Google Drive</h2>
              <p className="mt-1 text-sm text-ink-soft">Keep documents in Drive; Orbit mirrors each area (SOPs, Legal, Licensing…) with its own spot in the sidebar. Pages are read-only unless you turn on two-way sync for an SOP area.</p>
              <DriveTab slug={slug} workspaceId={workspace.id} isAppAdmin={user.isAppAdmin} />
            </section>
            {user.isAppAdmin && workspace.slug === "lemon-and-lavender" && (
              <section>
                <h2 className="text-lg font-semibold">Notion</h2>
                <ImportPanel slug={slug} />
              </section>
            )}
          </div>
        )}

        {tab === "integrations" && can(abilities, "manage_workspace") && (
          <section>
            <h2 className="text-lg font-semibold">Integrations</h2>
            <p className="mt-1 text-sm text-ink-soft">Connect the tools you run the business in, so the dashboard shows live numbers.</p>
            <IntegrationsTab slug={slug} workspaceId={workspace.id} fieldTool={workspace.fieldTool} isAppAdmin={user.isAppAdmin} notice={ok === "jobber" ? "Jobber connected. The dashboard tile is live." : undefined} error={error} />
          </section>
        )}

        {tab === "ai" && admin && (
          <section>
            <h2 className="text-lg font-semibold">AI access</h2>
            <p className="mt-1 text-sm text-ink-soft">Which AI tools can read and change this company&apos;s pages and tasks, and what needs your approval first.</p>
            <AiTab slug={slug} workspaceId={workspace.id} approvalRule={workspace.aiApproval} />
          </section>
        )}
      </div>
    </div>
  );
}

async function PeopleTab({ slug, workspaceId, role, canManage, userId }: { slug: string; workspaceId: string; role: Role; canManage: boolean; userId: string }) {
  const [{ members, pending }, jobRoles] = await Promise.all([listMembers(workspaceId), listRoles(workspaceId)]);
  const me = members.find((m) => m.userId === userId);
  return (
    <div className="space-y-8">
      {me && (
        <section>
          <h2 className="text-lg font-semibold">My notifications</h2>
          <p className="mt-1 text-sm text-ink-soft">Just for you. Everyone chooses their own.</p>
          <div className="mt-3">
            <NotificationsPanel email={me.email} taskEmail={me.notifyTaskEmail} digest={me.notifyDigest} />
          </div>
        </section>
      )}
      <section>
        <h2 className="text-lg font-semibold">People</h2>
        <p className="mt-1 text-sm text-ink-soft">Who can open this company in Orbit. The access level says what they can change; job roles say what work is theirs.</p>
        <MembersPanel
          slug={slug}
          myRole={role}
          myId={userId}
          canManage={canManage}
          members={members.map((m) => ({ ...m, lastSeenAt: m.lastSeenAt?.toISOString() ?? null }))}
          pending={pending.map((p) => ({ id: p.id, email: p.email, role: p.role, firstName: p.firstName, lastName: p.lastName }))}
          roles={ROLE_LABELS}
          jobRoles={jobRoles.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, color: r.color }))}
        />
      </section>
      <section>
        <h2 className="text-lg font-semibold">Job roles</h2>
        <p className="mt-1 text-sm text-ink-soft">Define the roles in your company, what each one is allowed to do in Orbit, and who holds it. Tasks can be assigned to a role so everyone in it sees the work as theirs.</p>
        <RolesPanel slug={slug} canManage={canManage} roles={jobRoles.map((r) => ({ ...r, members: r.members }))} members={members.map((m) => ({ id: m.userId, name: m.name ?? m.email }))} permissionInfo={PERMISSION_LABELS} />
      </section>
    </div>
  );
}

async function DriveTab({ slug, workspaceId, isAppAdmin }: { slug: string; workspaceId: string; isAppAdmin: boolean }) {
  const [conns, counts, saStatus] = await Promise.all([listCollections(workspaceId), collectionCounts(workspaceId), serviceAccountStatus()]);
  const { wordFileCount } = await import("@/lib/drive/twoway");
  const wordCounts = new Map(await Promise.all(conns.map(async (c) => [c.id, c.kind === "sop" ? await wordFileCount(c.id) : 0] as const)));
  return (
    <DrivePanel
      slug={slug}
      serviceEmail={saStatus.state === "ok" ? saStatus.email : null}
      problem={saStatus.state === "invalid" ? saStatus.reason : null}
      isAppAdmin={isAppAdmin}
      kinds={Object.fromEntries(Object.entries(KIND_INFO).map(([k, v]) => [k, { label: v.label, icon: v.icon, hint: v.hint }])) as Parameters<typeof DrivePanel>[0]["kinds"]}
      collections={conns.map((c) => ({ id: c.id, label: c.label, icon: c.icon, kind: c.kind, folderIds: c.folderIds, folderNames: c.folderNames, excludeFolderIds: c.excludeFolderIds, lastSyncAt: c.lastSyncAt?.toISOString() ?? null, lastSyncStatus: c.lastSyncStatus, lastSyncCounts: c.lastSyncCounts, twoWay: c.twoWay, wordFiles: wordCounts.get(c.id) ?? 0, count: counts.get(c.id) ?? 0 }))}
    />
  );
}

async function IntegrationsTab({ slug, workspaceId, fieldTool, isAppAdmin, notice, error }: { slug: string; workspaceId: string; fieldTool: FieldTool; isAppAdmin: boolean; notice?: string; error?: string }) {
  const [row, cfg] = await Promise.all([getIntegration(workspaceId, fieldTool), jobberAppConfig()]);
  return (
    <IntegrationsPanel
      slug={slug}
      fieldTool={fieldTool}
      isAppAdmin={isAppAdmin}
      redirectUri={redirectUri()}
      notice={notice}
      error={error}
      jobber={{ connected: Boolean(row), manual: row?.accessToken === MANUAL_TOKEN, accountName: row?.accountName ?? null, connectedAt: row?.createdAt.toISOString() ?? null, lastError: row?.lastError ?? null, appConfigured: Boolean(cfg) }}
    />
  );
}

async function AiTab({ slug, workspaceId, approvalRule }: { slug: string; workspaceId: string; approvalRule: "sops" | "all" | "none" }) {
  const grants = await listGrants(workspaceId);
  return (
    <AiAccessPanel
      slug={slug}
      grants={grants.map((g) => ({ ...g, createdAt: g.createdAt.toISOString(), lastUsedAt: g.lastUsedAt?.toISOString() ?? null, revokedAt: g.revokedAt?.toISOString() ?? null }))}
      scopeInfo={Object.entries(SCOPE_LABELS).map(([key, v]) => ({ key, ...v }))}
      mcpUrl={`${appUrl()}/api/mcp`}
      approvalRule={approvalRule}
    />
  );
}
