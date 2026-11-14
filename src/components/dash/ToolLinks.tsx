"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { addToolLinkAction, removeToolLinkAction } from "@/app/dash-actions";
import { useToast } from "@/components/ui/Toast";

type Link = { id: string; label: string; url: string };

/** Pinned links under Tools, such as the Schedule Planner that lives in Claude. */
export function ToolLinks({ slug, links }: { slug: string; links: Link[] }) {
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
  return (
    <div className="card divide-y divide-line">
      {links.map((l) => (
        <div key={l.id} className="flex min-h-14 items-center gap-1 pr-2">
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-hover">
            <ExternalLink size={16} className="shrink-0 text-accent" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{l.label}</span>
              <span className="block truncate text-xs text-ink-soft">Opens {host(l.url)}</span>
            </span>
          </a>
          <button
            onClick={() => confirm(`Remove "${l.label}" from Tools?`) && start(async () => { const r = await removeToolLinkAction(slug, l.id); if (!r.ok) toast(r.error, false); })}
            disabled={busy}
            className="tap-icon rounded-lg p-2 text-ink-faint hover:bg-hover hover:text-danger"
            aria-label={`Remove ${l.label}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      {adding ? (
        <form
          className="space-y-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addToolLinkAction(slug, label, url);
              if (!r.ok) return toast(r.error, false);
              setLabel("");
              setUrl("");
              setAdding(false);
            });
          }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name, e.g. Schedule Planner" className="field" maxLength={60} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" className="field" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !label.trim() || !url.trim()} className="btn btn-primary">Add link</button>
            <button type="button" onClick={() => setAdding(false)} className="btn">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-sm text-ink-soft hover:bg-hover hover:text-ink">
          <Plus size={16} /> {links.length ? "Add another tool link" : "Add a tool link (e.g. the Schedule Planner)"}
        </button>
      )}
    </div>
  );
}
