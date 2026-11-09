"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, ExternalLink, Search, FolderOpen, LayoutGrid, List } from "lucide-react";

type Row = { id: string; parentId: string | null; title: string; icon: string | null; sourceLink: string | null; isFolder: boolean; docType: string | null; docStatus: string | null; updatedAt: string };
type Coll = { id: string; label: string; icon: string; kindLabel: string; rootPageId: string | null; folderIds: string[]; folderNames: string[]; lastSyncAt: string | null };

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Folder-style browser for one document area: subfolders as cards, files as rows, search across everything. */
export function CollectionBrowser({ slug, collection, rows }: { slug: string; collection: Coll; rows: Row[] }) {
  const [folder, setFolder] = useState<string | null>(collection.rootPageId);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  const byParent = useMemo(() => {
    const m = new Map<string | null, Row[]>();
    for (const r of rows) {
      if (r.id === collection.rootPageId) continue;
      const list = m.get(r.parentId) ?? [];
      list.push(r);
      m.set(r.parentId, list);
    }
    for (const list of m.values()) list.sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.title.localeCompare(b.title));
    return m;
  }, [rows, collection.rootPageId]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const crumbs = useMemo(() => {
    const out: Row[] = [];
    let cur = folder ? byId.get(folder) : undefined;
    while (cur && cur.id !== collection.rootPageId) {
      out.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return out;
  }, [folder, byId, collection.rootPageId]);

  const countIn = (id: string): number => (byParent.get(id) ?? []).reduce((n, r) => n + (r.isFolder ? countIn(r.id) : 1), 0);
  const pathOf = (r: Row) => {
    const parts: string[] = [];
    let cur = r.parentId ? byId.get(r.parentId) : undefined;
    while (cur && cur.id !== collection.rootPageId) {
      parts.unshift(cur.title);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(" / ");
  };

  const searching = q.trim().length > 0;
  const items = searching ? rows.filter((r) => !r.isFolder && r.id !== collection.rootPageId && r.title.toLowerCase().includes(q.toLowerCase())) : (byParent.get(folder) ?? []);
  const folders = items.filter((r) => r.isFolder);
  const files = items.filter((r) => !r.isFolder);
  const total = rows.filter((r) => !r.isFolder && r.id !== collection.rootPageId).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl md:text-4xl">{collection.icon}</span>
          <div>
            <h1 className="text-xl font-semibold md:text-2xl">{collection.label}</h1>
            <p className="text-sm text-ink-soft">
              {collection.kindLabel} · {total} documents
              {collection.lastSyncAt && ` · synced ${fmt(collection.lastSyncAt)}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {collection.folderIds.map((id, i) => (
            <a key={id} href={`https://drive.google.com/drive/folders/${id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-hover">
              <FolderOpen size={14} /> {collection.folderIds.length > 1 ? collection.folderNames[i] : "Open in Drive"} <ExternalLink size={11} />
            </a>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${collection.label}…`} className="w-full rounded-lg border border-line bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-ink-faint" />
        </div>
        <div className="flex rounded-lg border border-line p-0.5">
          <button onClick={() => setView("grid")} className={`rounded-md p-1.5 ${view === "grid" ? "bg-hover text-ink" : "text-ink-faint"}`} aria-label="Grid">
            <LayoutGrid size={15} />
          </button>
          <button onClick={() => setView("list")} className={`rounded-md p-1.5 ${view === "list" ? "bg-hover text-ink" : "text-ink-faint"}`} aria-label="List">
            <List size={15} />
          </button>
        </div>
      </div>

      {!searching && (
        <nav className="mt-4 flex flex-wrap items-center gap-1 text-sm text-ink-soft">
          <button onClick={() => setFolder(collection.rootPageId)} className={`rounded px-1.5 py-0.5 hover:bg-hover ${crumbs.length ? "" : "font-medium text-ink"}`}>
            {collection.icon} {collection.label}
          </button>
          {crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight size={13} className="text-ink-faint" />
              <button onClick={() => setFolder(c.id)} className={`rounded px-1.5 py-0.5 hover:bg-hover ${i === crumbs.length - 1 ? "font-medium text-ink" : ""}`}>
                {c.title}
              </button>
            </span>
          ))}
        </nav>
      )}

      {folders.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {folders.map((f) => (
            <button key={f.id} onClick={() => setFolder(f.id)} className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-3 text-left hover:border-ink-faint hover:bg-hover">
              <span className="text-2xl">📁</span>
              <span className="min-w-0">
                <span className="line-clamp-2 block text-sm font-medium">{f.title}</span>
                <span className="block text-xs text-ink-faint">{countIn(f.id)} items</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {files.length === 0 && folders.length === 0 && <div className="mt-6 rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-faint">{searching ? "Nothing matches." : "This folder is empty."}</div>}

      {files.length > 0 && view === "grid" && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((f) => (
            <div key={f.id} className="group flex items-start gap-3 rounded-xl border border-line bg-card p-3 hover:border-ink-faint">
              <span className="mt-0.5 text-2xl">{f.icon ?? "📄"}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/w/${slug}/p/${f.id}`} className="line-clamp-2 block text-sm font-medium hover:underline">
                  {f.title}
                </Link>
                <div className="truncate text-xs text-ink-faint">
                  {searching && pathOf(f) ? `${pathOf(f)} · ` : ""}
                  {f.docType ?? "Document"} · {fmt(f.updatedAt)}
                </div>
              </div>
              {f.sourceLink && (
                <a href={f.sourceLink} target="_blank" rel="noreferrer" className="rounded p-1.5 text-ink-faint hover:bg-hover hover:text-ink" title="Open in Google Drive">
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && view === "list" && (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-card">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 hover:bg-hover">
              <span className="text-lg">{f.icon ?? "📄"}</span>
              <Link href={`/w/${slug}/p/${f.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                {f.title}
                {searching && pathOf(f) && <span className="ml-2 text-xs text-ink-faint">{pathOf(f)}</span>}
              </Link>
              <span className="hidden text-xs text-ink-faint sm:block">{f.docType ?? ""}</span>
              <span className="hidden text-xs text-ink-faint sm:block">{fmt(f.updatedAt)}</span>
              {f.sourceLink && (
                <a href={f.sourceLink} target="_blank" rel="noreferrer" className="rounded p-1.5 text-ink-faint hover:text-ink" title="Open in Google Drive">
                  <ExternalLink size={14} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
