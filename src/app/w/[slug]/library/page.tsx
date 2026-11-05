import { requireWorkspacePage } from "@/lib/access";
import { listLibrary, listChangeLog } from "@/lib/services/pages";
import { LibraryView } from "@/components/library/LibraryView";
import { DOC_AREAS, DOC_TYPES } from "@/db/schema";

export default async function LibraryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspacePage(slug);
  const [docs, log] = await Promise.all([listLibrary(workspace.id), listChangeLog(workspace.id, 30)]);
  return (
    <LibraryView
      slug={slug}
      docs={docs.map((d) => ({ ...d, updatedAt: d.updatedAt.toISOString() }))}
      log={log.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
      types={DOC_TYPES}
      areas={DOC_AREAS}
    />
  );
}
