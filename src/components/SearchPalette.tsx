"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, FileText, CheckSquare, UserRound, CornerDownLeft, ExternalLink, MessagesSquare, LayoutGrid } from "lucide-react";
import { searchAllAction } from "@/app/actions";

type Results = Awaited<ReturnType<typeof searchAllAction>>;
type Row = { key: string; kind: "screen" | "link" | "page" | "task" | "meeting" | "person"; title: string; sub?: string; icon: React.ReactNode; href: string; tag?: string; external?: boolean };

/** ⌘K: Orbit screens, menu links (tools, reports, documents, websites), pages and SOPs, tasks, meetings and people, with keyboard navigation. */
export function SearchPalette({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results>({ pages: [], tasks: [], people: [], links: [], meetings: [], screens: [] });
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (!q.trim()) return setRes({ pages: [], tasks: [], people: [], links: [], meetings: [], screens: [] });
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        setRes(await searchAllAction(slug, q));
      } finally {
        setLoading(false);
        setSel(0);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [q, slug]);

  const rows = useMemo<Row[]>(
    () => [
      ...res.screens.map((x) => ({ key: `s:${x.href}`, kind: "screen" as const, title: x.title, sub: "Open in Orbit", icon: <LayoutGrid size={15} className="text-ink-faint" />, href: x.href })),
      ...res.links.map((l) => ({ key: `l:${l.id}`, kind: "link" as const, title: l.label, sub: l.description || l.url, icon: <ExternalLink size={15} className="text-ink-faint" />, href: l.url, tag: l.list, external: true })),
      ...res.pages.map((h) => ({ key: `p:${h.id}`, kind: "page" as const, title: h.title || "Untitled", sub: h.snippet ? `…${h.snippet}…` : undefined, icon: <span className="text-base leading-none">{h.icon ?? "📄"}</span>, href: `/w/${slug}/p/${h.id}`, tag: h.isSop ? "SOP" : undefined })),
      ...res.tasks.map((t) => ({ key: `t:${t.id}`, kind: "task" as const, title: t.title, sub: `${t.frequency} · ${t.who}`, icon: <CheckSquare size={15} className="text-ink-faint" />, href: `/w/${slug}/tasks`, tag: t.state === "overdue" ? "Overdue" : t.state === "today" ? "Today" : undefined })),
      ...res.meetings.map((m) => ({ key: `m:${m.id}`, kind: "meeting" as const, title: m.series, sub: new Date(m.at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), icon: <MessagesSquare size={15} className="text-ink-faint" />, href: `/w/${slug}/meetings/${m.id}` })),
      ...res.people.map((m) => ({ key: `u:${m.id}`, kind: "person" as const, title: m.name, sub: m.roles || m.email, icon: <UserRound size={15} className="text-ink-faint" />, href: m.canOpen ? `/w/${slug}/team/${m.id}` : `/w/${slug}/settings?tab=people` })),
    ],
    [res, slug],
  );

  const open = (r?: Row) => {
    if (!r) return;
    onClose();
    if (r.external) window.open(r.href, "_blank", "noopener,noreferrer");
    else router.push(r.href);
  };
  const sections: { label: string; kind: Row["kind"]; icon: React.ReactNode }[] = [
    { label: "Go to", kind: "screen", icon: <LayoutGrid size={11} /> },
    { label: "Tools & links", kind: "link", icon: <ExternalLink size={11} /> },
    { label: "Pages & SOPs", kind: "page", icon: <FileText size={11} /> },
    { label: "Tasks", kind: "task", icon: <CheckSquare size={11} /> },
    { label: "Meetings", kind: "meeting", icon: <MessagesSquare size={11} /> },
    { label: "People", kind: "person", icon: <UserRound size={11} /> },
  ];

  if (typeof document === "undefined") return null;
  // Portal out of the sidebar: its slide-in transform would otherwise trap this fixed overlay.
  return createPortal(
    <div className="anim-fade fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-3 pt-[8vh] backdrop-blur-[2px] md:pt-[15vh]" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Search">
      <div className="anim-rise w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-card shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={18} className="text-ink-faint" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, rows.length - 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
              if (e.key === "Enter") open(rows[sel]);
            }}
            placeholder="Search everything: tools, links, pages, tasks, meetings, people…"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
            aria-label="Search"
          />
          {loading && <span className="text-xs text-ink-faint">Searching…</span>}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1 scrollbar-thin">
          {q.trim() && !loading && rows.length === 0 && <p className="px-3 py-8 text-center text-sm text-ink-faint">No matches for &ldquo;{q}&rdquo;.</p>}
          {!q.trim() && (
            <div className="px-3 py-6 text-center text-sm text-ink-faint">
              Type to search tools, reports, documents, websites, pages and SOPs, tasks, meetings and people.
              <div className="mt-2 flex justify-center gap-3 text-[11px]">
                <span><kbd className="kbd">↑↓</kbd> move</span>
                <span><kbd className="kbd">↵</kbd> open</span>
                <span><kbd className="kbd">esc</kbd> close</span>
              </div>
            </div>
          )}
          {sections.map((sec) => {
            const list = rows.filter((r) => r.kind === sec.kind);
            if (!list.length) return null;
            return (
              <div key={sec.kind}>
                <div className="eyebrow flex items-center gap-1 px-3 pb-1 pt-2">
                  {sec.icon} {sec.label}
                </div>
                <ul>
                  {list.map((r) => {
                    const i = rows.indexOf(r);
                    return (
                      <li key={r.key}>
                        <button onMouseEnter={() => setSel(i)} onClick={() => open(r)} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left ${i === sel ? "bg-hover" : ""}`}>
                          <span className="flex w-5 shrink-0 justify-center">{r.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 text-sm font-medium">
                              <span className="truncate">{r.title}</span>
                              {r.tag && <span className={`rounded px-1.5 text-[10px] font-semibold ${r.tag === "Overdue" ? "bg-danger-soft text-danger" : r.kind === "link" ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn"}`}>{r.tag}</span>}
                            </span>
                            {r.sub && <span className="block truncate text-xs text-ink-faint">{r.sub}</span>}
                          </span>
                          {i === sel && <CornerDownLeft size={13} className="shrink-0 text-ink-faint" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.querySelector("[data-ws-theme]") ?? document.body,
  );
}
