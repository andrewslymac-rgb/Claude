"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useTransition } from "react";
import { X, Bot, User, RefreshCw } from "lucide-react";
import { getVersionAction, listVersionsAction, restoreVersionAction } from "@/app/actions";

const Editor = dynamic(() => import("./Editor"), { ssr: false });

type V = Awaited<ReturnType<typeof listVersionsAction>>[number];

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function VersionHistory({
  slug,
  pageId,
  canRestore,
  onClose,
  beforeRestore,
  onRestored,
}: {
  slug: string;
  pageId: string;
  canRestore: boolean;
  onClose: () => void;
  beforeRestore: () => Promise<void>;
  onRestored: (r: { title: string; content: unknown[] }) => void;
}) {
  const [versions, setVersions] = useState<V[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; content: unknown[] } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    listVersionsAction(slug, pageId).then((v) => {
      setVersions(v);
      if (v[0]) setSelected(v[0].id);
    });
  }, [slug, pageId]);

  useEffect(() => {
    if (!selected) return;
    setPreview(null);
    getVersionAction(slug, pageId, selected).then(setPreview);
  }, [selected, slug, pageId]);

  const latest = versions?.[0]?.id;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/60" onMouseDown={onClose}>
      <div className="mb-safe mt-safe flex flex-1 flex-col-reverse overflow-hidden border border-line bg-card shadow-2xl md:m-4 md:rounded-xl md:flex-row" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8">
          {preview ? (
            <>
              <h1 className="mb-4 text-3xl font-bold">{preview.title || "Untitled"}</h1>
              <Editor key={selected} initial={preview.content} editable={false} />
            </>
          ) : (
            <div className="text-sm text-ink-faint">Loading…</div>
          )}
        </div>
        <aside className="flex max-h-[45%] w-full flex-col border-b border-line bg-side md:max-h-none md:w-80 md:border-b-0 md:border-l">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="font-semibold">Version history</h2>
            <button onClick={onClose} className="tap-icon rounded p-1 hover:bg-hover" aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto px-2">
            {versions?.map((v) => (
              <li key={v.id}>
                <button onClick={() => setSelected(v.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected === v.id ? "bg-card shadow-sm" : "hover:bg-hover"}`}>
                  <div className="font-medium">
                    {fmt(v.updatedAt)} {v.id === latest && <span className="ml-1 text-xs text-ink-faint">current</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
                    {v.actorType === "ai" ? <Bot size={12} /> : v.actorType === "sync" ? <RefreshCw size={12} /> : <User size={12} />}
                    {v.actorType === "ai" ? `AI (${v.actorName ?? "token"})` : v.actorType === "sync" ? "Google Drive sync" : (v.actorName ?? "Someone")}
                  </div>
                  {v.note && <div className="mt-1 text-xs text-ink">{v.note}</div>}
                  {v.why && <div className="text-xs text-ink-soft">Why: {v.why}</div>}
                  {v.note && v.note !== "Created" && !v.note.startsWith("Restored") && <div className={`mt-0.5 text-[10px] ${v.teamTold ? "text-ok" : "text-warn"}`}>{v.teamTold ? "Team told" : "Team not told yet"}</div>}
                </button>
              </li>
            ))}
          </ul>
          {canRestore && selected && selected !== latest && (
            <div className="border-t border-line p-3">
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await beforeRestore();
                    onRestored(await restoreVersionAction(slug, pageId, selected));
                  })
                }
                className="w-full btn btn-primary"
              >
                {pending ? "Restoring…" : "Restore this version"}
              </button>
              <p className="mt-2 text-xs text-ink-faint">Restoring keeps all history. You can always undo it.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
