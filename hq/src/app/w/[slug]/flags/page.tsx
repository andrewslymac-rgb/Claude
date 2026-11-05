import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { listFlags } from "@/lib/services/flags";
import { listTree } from "@/lib/services/pages";
import { FlagsView } from "@/components/library/FlagsView";

export default async function FlagsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireWorkspacePage(slug);
  const [flags, tree] = await Promise.all([listFlags(workspace.id), listTree(workspace.id)]);
  return (
    <FlagsView
      slug={slug}
      flags={flags.map((f) => ({ ...f, foundAt: f.foundAt.toISOString(), resolvedAt: f.resolvedAt?.toISOString() ?? null }))}
      pages={tree.map((p) => ({ id: p.id, title: p.title || "Untitled", icon: p.icon }))}
      canEdit={can(role, "edit")}
    />
  );
}
