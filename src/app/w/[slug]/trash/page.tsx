import { requireWorkspacePage } from "@/lib/access";
import { listTrash } from "@/lib/services/pages";
import { can } from "@/lib/permissions";
import { RestoreButton } from "@/components/page/RestoreButton";

export default async function Trash({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireWorkspacePage(slug);
  const items = await listTrash(workspace.id);
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">🗑️ Trash</h1>
      <p className="mt-1 text-sm text-ink-soft">Deleted pages stay here so nothing is ever lost. Restore puts a page (and everything inside it) back.</p>
      <ul className="mt-6 divide-y divide-line rounded-xl border border-line">
        {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-faint">Trash is empty.</li>}
        {items.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-3">
            <span className="truncate">
              {p.icon ?? "📄"} {p.title || "Untitled"}
              <span className="ml-2 text-xs text-ink-faint">deleted {p.archivedAt?.toLocaleDateString()}</span>
            </span>
            {can(role, "edit") && <RestoreButton slug={slug} pageId={p.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
