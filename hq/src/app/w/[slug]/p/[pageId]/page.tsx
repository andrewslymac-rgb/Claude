import { notFound } from "next/navigation";
import { requireWorkspacePage } from "@/lib/access";
import { can } from "@/lib/permissions";
import { getPage, listTree, isTwoWayEditable, pageRelations } from "@/lib/services/pages";
import { PageView } from "@/components/page/PageView";
import { listMembers } from "@/lib/services/members";
import { DOC_AREAS, DOC_AUDIENCES, DOC_TYPES } from "@/db/schema";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export default async function PageRoute({ params }: { params: Promise<{ slug: string; pageId: string }> }) {
  const { slug, pageId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(pageId)) notFound();
  const { workspace, role, abilities } = await requireWorkspacePage(slug);
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
  const { members } = await listMembers(workspace.id);
  const reviewer = page.lastReviewedById ? (await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, page.lastReviewedById)))[0] : null;
  const [twoWay, rel] = await Promise.all([isTwoWayEditable(page), pageRelations(workspace.id, page.id)]);
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
        twoWay,
        drivePending: page.drivePushPending,
        driveConflict: page.driveConflict,
        archived: Boolean(page.archivedAt),
        updatedAt: page.updatedAt.toISOString(),
      }}
      crumbs={crumbs}
      subpages={children}
      canEdit={can(abilities, "edit") && (page.source === "local" || twoWay) && !page.archivedAt}
      canLog={can(abilities, "edit") && !page.archivedAt}
      relations={{ ...rel, meta: { ...rel.meta, updatedAt: rel.meta.updatedAt?.toISOString() ?? null, driveModifiedAt: rel.meta.driveModifiedAt?.toISOString() ?? null, createdAt: rel.meta.createdAt?.toISOString() ?? null } }}
      docInfo={{
        docType: page.docType,
        area: page.area,
        audience: page.audience,
        docStatus: page.docStatus,
        ownerId: page.ownerId,
        reviewCycle: page.reviewCycle,
        lastReviewedOn: page.lastReviewedOn,
        lastReviewedBy: reviewer?.name ?? null,
        sourceLink: page.sourceLink,
        sensitive: page.sensitive,
        docVersion: page.docVersion,
      }}
      members={members.map((m) => ({ id: m.userId, name: m.name ?? m.email }))}
      docOptions={{ types: DOC_TYPES, areas: DOC_AREAS, audiences: DOC_AUDIENCES }}
    />
  );
}
