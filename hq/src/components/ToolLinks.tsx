"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Plus, Star, Trash2 } from "lucide-react";
import { addLinkAction, removeLinkAction, toggleLinkStarAction } from "@/app/tool-actions";
import { useToast } from "@/components/ui/Toast";

type Link = { id: string; label: string; url: string; starred?: boolean };

const WORDS = {
  tools: { section: "Tools and reports", placeholder: "Name, e.g. Schedule Planner", addMore: "Add another tool link", addFirst: "Add a tool link (e.g. the Schedule Planner)" },
  links: { section: "Links", placeholder: "Name, e.g. Google Business Profile", addMore: "Add another link", addFirst: "Add a link to a website you use" },
};

/** A list of pinned menu links: Tools and reports, or Links. Only owners and admins can add or remove. */
export function ToolLinks({ slug, links, kind = "tools", canManage = true }: { slug: string; links: Link[]; kind?: "tools" | "links"; canManage?: boolean }) {
  const w = WORDS[kind];
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, start] = useTransition();
  const toast = useToast();
  const host = (u: string) => {
    try {
      return new URL(u).host.replace(/^www\./, "");
    } catch {
      return u;
    }
  };
  const nStarred = links.filter((l) => l.starred).length;
  const groupHead = (text: string) => <div className="eyebrow bg-side/40 px-4 py-2">{text}</div>;
  return (
    <div className="card divide-y divide-line">
      {links.map((l, i) => (
        <div key={l.id}>
        {nStarred > 0 && i === 0 && groupHead("Starred")}
        {nStarred > 0 && i === nStarred && groupHead("All others")}
        <div className="flex min-h-14 items-center gap-1 pr-2">
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-hover">
            {l.starred ? <Star size={16} className="shrink-0 fill-current text-amber-400" /> : <ExternalLink size={16} className="shrink-0 text-accent" />}
            <span className="min-w-0">
              <span className="block truncate font-medium">{l.label}</span>
              <span className="block truncate text-xs text-ink-soft">Opens {host(l.url)}</span>
            </span>
          </a>
          <button
            onClick={() => start(async () => { const r = await toggleLinkStarAction(slug, l.id); if (!r.ok) toast(r.error, false); })}
            disabled={busy}
            className={`tap-icon rounded-lg p-2 hover:bg-hover ${l.starred ? "text-amber-400" : "text-ink-faint hover:text-amber-400"}`}
            aria-label={l.starred ? `Unstar ${l.label}` : `Star ${l.label}`}
            aria-pressed={Boolean(l.starred)}
            title={l.starred ? "Unstar" : "Star to keep it at the top"}
          >
            <Star size={16} className={l.starred ? "fill-current" : ""} />
          </button>
          {canManage && (
          <button
            onClick={() => confirm(`Remove "${l.label}" from ${w.section}?`) && start(async () => { const r = await removeLinkAction(slug, kind, l.id); if (!r.ok) toast(r.error, false); })}
            disabled={busy}
            className="tap-icon rounded-lg p-2 text-ink-faint hover:bg-hover hover:text-danger"
            aria-label={`Remove ${l.label}`}
          >
            <Trash2 size={16} />
          </button>
          )}
        </div>
        </div>
      ))}
      {!canManage ? (
        links.length ? null : <p className="px-4 py-6 text-sm text-ink-soft">No links yet.</p>
      ) : adding ? (
        <form
          className="space-y-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addLinkAction(slug, kind, label, url);
              if (!r.ok) return toast(r.error, false);
              setLabel("");
              setUrl("");
              setAdding(false);
            });
          }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={w.placeholder} className="field" maxLength={60} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" className="field" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !label.trim() || !url.trim()} className="btn btn-primary">Add link</button>
            <button type="button" onClick={() => setAdding(false)} className="btn">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-sm text-ink-soft hover:bg-hover hover:text-ink">
          <Plus size={16} /> {links.length ? w.addMore : w.addFirst}
        </button>
      )}
    </div>
  );
}
