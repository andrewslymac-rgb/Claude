import { notFound } from "next/navigation";
import { requireWorkspacePage } from "@/lib/access";
import { collectionPages, getCollection, KIND_INFO } from "@/lib/drive/sync";
import { CollectionBrowser } from "@/components/docs/CollectionBrowser";

export default async function CollectionPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { workspace } = await requireWorkspacePage(slug);
  const conn = await getCollection(workspace.id, id).catch(() => null);
  if (!conn) notFound();
  const rows = await collectionPages(workspace.id, conn.id);
  return (
    <CollectionBrowser
      slug={slug}
      collection={{ id: conn.id, label: conn.label, icon: conn.icon, kindLabel: KIND_INFO[conn.kind]?.label ?? "Documents", rootPageId: conn.rootPageId, folderIds: conn.folderIds, folderNames: conn.folderNames, lastSyncAt: conn.lastSyncAt?.toISOString() ?? null }}
      rows={rows.map((r) => ({ id: r.id, parentId: r.parentId, title: r.title, icon: r.icon, sourceLink: r.sourceLink, isFolder: r.icon === "📁", docType: r.docType, docStatus: r.docStatus, updatedAt: (r.driveModifiedAt ?? r.updatedAt).toISOString() }))}
    />
  );
}
