"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { searchAction } from "@/app/actions";

type Hit = { id: string; title: string; icon: string | null; snippet: string; isSop: boolean };

export function SearchPalette({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const t = setTimeout(async () => {
      setHits(q.trim() ? await searchAction(slug, q) : []);
      setSel(0);
    }, 150);
    return () => clearTimeout(t);
  }, [q, slug]);

  const open = (h?: Hit) => {
    if (!h) return;
    onClose();
    router.push(`/w/${slug}/p/${h.id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[15vh]" onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-card shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={18} className="text-ink-faint" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, hits.length - 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
              if (e.key === "Enter") open(hits[sel]);
            }}
            placeholder="Search pages and SOPs…"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none"
          />
        </div>
        <ul className="max-h-96 overflow-y-auto p-1">
          {q && hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-faint">No matches</li>}
          {!q && <li className="px-3 py-6 text-center text-sm text-ink-faint">Type to search titles and page text</li>}
          {hits.map((h, i) => (
            <li key={h.id}>
              <button onMouseEnter={() => setSel(i)} onClick={() => open(h)} className={`w-full rounded-lg px-3 py-2 text-left ${i === sel ? "bg-hover" : ""}`}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{h.icon ?? "📄"}</span> {h.title || "Untitled"}
                  {h.isSop && <span className="rounded bg-warn-soft px-1.5 text-[10px] font-semibold text-warn">SOP</span>}
                </div>
                {h.snippet && <div className="mt-0.5 truncate pl-6 text-xs text-ink-faint">…{h.snippet}…</div>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
