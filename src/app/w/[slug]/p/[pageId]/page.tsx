import { notFound } from "next/navigation";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { getPage, listTree } from "@/lib/services/pages";
import { PageView } from "@/components/page/PageView";

export default async function PageRoute({ params }: { params: Promise<{ slug: string; pageId: string }> }) {
  const { slug, pageId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(pageId)) notFound();
  const { workspace, role } = await requireWorkspacePage(slug);
  const page = await getPage(workspace.id, pageId);
  if (!page) notFound();

  // Breadcrumbs: walk up the tree.
  const tree = await listTree(workspace.id);
  const byId = new Map(tree.map((n) => [n.id, n]));
  const crumbs: { id: string; title: string; icon: string | null }[] = [];
  let cur = page.parentId ? byId.get(page.parentId) : undefined;
  while (cur) {
    crumbs.unshift({ id: cur.id, title: cur.title || "Untitled", icon: cur.icon });
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  const children = tree.filter((n) => n.parentId === page.id).map((n) => ({ id: n.id, title: n.title || "Untitled", icon: n.icon }));

  return (
    <PageView
      key={page.id}
      slug={slug}
      page={{
        id: page.id,
        title: page.title,
        icon: page.icon,
        content: page.content,
        isSop: page.isSop,
        source: page.source,
        archived: Boolean(page.archivedAt),
        updatedAt: page.updatedAt.toISOString(),
      }}
      crumbs={crumbs}
      subpages={children}
      canEdit={can(role, "edit") && page.source === "local" && !page.archivedAt}
    />
  );
}
