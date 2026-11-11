import { requireWorkspacePage } from "@/lib/access";
import { listLibrary, listChangeLog, openDocNoteCounts } from "@/lib/services/pages";
import { LibraryView } from "@/components/library/LibraryView";
import { DOC_AREAS, DOC_TYPES } from "@/db/schema";
import { listCollections } from "@/lib/drive/sync";

export default async function LibraryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspacePage(slug);
  const [docs, log, collections, noteCounts] = await Promise.all([listLibrary(workspace.id), listChangeLog(workspace.id, 30), listCollections(workspace.id), openDocNoteCounts(workspace.id)]);
  return (
    <LibraryView
      slug={slug}
      docs={docs.map((d) => ({ ...d, updatedAt: d.updatedAt.toISOString(), openNotes: noteCounts.get(d.id) ?? 0 }))}
      log={log.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
      types={DOC_TYPES}
      areas={DOC_AREAS}
      collections={collections.map((c) => ({ id: c.id, label: c.label, icon: c.icon }))}
    />
  );
}
