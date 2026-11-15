"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight, ExternalLink, FileText, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { addLinkAction, moveLinkAction, removeLinkAction, toggleLinkStarAction, updateLinkAction } from "@/app/tool-actions";
import { useToast } from "@/components/ui/Toast";

type Link = { id: string; label: string; url: string; description?: string; starred?: boolean };
type Kind = "tools" | "reports" | "links" | "docs";

const WORDS: Record<Kind, { section: string; other: string; placeholder: string; describe: string; addMore: string; addFirst: string }> = {
  tools: { section: "Tools", other: "Reports", placeholder: "Name, e.g. Schedule Planner", describe: "What it's for and when to use it (optional)", addMore: "Add another tool", addFirst: "Add a tool (e.g. the Schedule Planner)" },
  reports: { section: "Reports", other: "Tools", placeholder: "Name, e.g. Weekly sales report", describe: "What it shows and how often to check it (optional)", addMore: "Add another report", addFirst: "Add a report link" },
  links: { section: "Websites", other: "Documents", placeholder: "Name, e.g. Google Business Profile", describe: "What the team uses it for (optional)", addMore: "Add another website", addFirst: "Add a link to a website you use" },
  docs: { section: "Documents", other: "Websites", placeholder: "Name, e.g. Price sheet", describe: "What's in it and who it's for (optional)", addMore: "Add another document", addFirst: "Add a link to a document (Google Doc, Sheet, PDF…)" },
};

const host = (u: string) => {
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** The name / address / description form, used both to add a link and to edit one. */
function LinkForm({ kind, initial, saveLabel, busy, onSave, onCancel }: { kind: Kind; initial?: Link; saveLabel: string; busy: boolean; onSave: (v: { label: string; url: string; description: string }) => void; onCancel: () => void }) {
  const w = WORDS[kind];
  const [label, setLabel] = useState(initial?.label ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  return (
    <form
      className="space-y-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ label, url, description });
      }}
    >
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={w.placeholder} className="field" maxLength={60} aria-label="Name" />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" className="field" aria-label="Address" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={w.describe} className="field min-h-20" maxLength={500} aria-label="Description" />
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !label.trim() || !url.trim()} className="btn btn-primary">
          {saveLabel}
        </button>
        <button type="button" onClick={onCancel} className="btn">
          Cancel
        </button>
      </div>
    </form>
  );
}

/** One list of menu links with descriptions: Tools, Reports, Websites or Documents. Only owners and admins can add, edit, move or remove. */
export function ToolLinks({ slug, links, kind = "tools", canManage = true }: { slug: string; links: Link[]; kind?: Kind; canManage?: boolean }) {
  const w = WORDS[kind];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error ?? "Something went wrong.", false);
      after?.();
    });
  const nStarred = links.filter((l) => l.starred).length;
  const groupHead = (text: string) => <div className="eyebrow bg-side/40 px-4 py-2">{text}</div>;
  const Icon = kind === "docs" ? FileText : ExternalLink;
  return (
    <div className="card divide-y divide-line">
      {links.map((l, i) => (
        <div key={l.id}>
          {nStarred > 0 && i === 0 && groupHead("Starred")}
          {nStarred > 0 && i === nStarred && groupHead("All others")}
          {editing === l.id ? (
            <LinkForm kind={kind} initial={l} saveLabel="Save" busy={busy} onCancel={() => setEditing(null)} onSave={(v) => run(() => updateLinkAction(slug, kind, l.id, v), () => setEditing(null))} />
          ) : (
            <div className="flex min-h-14 items-start gap-1 pr-2">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 hover:bg-hover">
                {l.starred ? <Star size={16} className="mt-0.5 shrink-0 fill-current text-amber-400" /> : <Icon size={16} className="mt-0.5 shrink-0 text-accent" />}
                <span className="min-w-0">
                  <span className="block font-medium">{l.label}</span>
                  {l.description && <span className="mt-0.5 block whitespace-pre-line text-sm text-ink-soft">{l.description}</span>}
                  <span className="mt-0.5 block truncate text-xs text-ink-faint">Opens {host(l.url)}</span>
                </span>
              </a>
              <div className="flex shrink-0 items-center pt-1.5">
                <button
                  onClick={() => run(() => toggleLinkStarAction(slug, l.id))}
                  disabled={busy}
                  className={`tap-icon rounded-lg p-2 hover:bg-hover ${l.starred ? "text-amber-400" : "text-ink-faint hover:text-amber-400"}`}
                  aria-label={l.starred ? `Unstar ${l.label}` : `Star ${l.label}`}
                  aria-pressed={Boolean(l.starred)}
                  title={l.starred ? "Unstar" : "Star to keep it in your menu"}
                >
                  <Star size={16} className={l.starred ? "fill-current" : ""} />
                </button>
                {canManage && (
                  <>
                    <button onClick={() => (setAdding(false), setEditing(l.id))} disabled={busy} className="tap-icon rounded-lg p-2 text-ink-faint hover:bg-hover hover:text-ink" aria-label={`Edit ${l.label}`} title="Edit name, address or description">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => run(() => moveLinkAction(slug, kind, l.id))} disabled={busy} className="tap-icon rounded-lg p-2 text-ink-faint hover:bg-hover hover:text-ink" aria-label={`Move ${l.label} to ${w.other}`} title={`Move to ${w.other}`}>
                      <ArrowLeftRight size={16} />
                    </button>
                    <button
                      onClick={() => confirm(`Remove "${l.label}" from ${w.section}?`) && run(() => removeLinkAction(slug, kind, l.id))}
                      disabled={busy}
                      className="tap-icon rounded-lg p-2 text-ink-faint hover:bg-hover hover:text-danger"
                      aria-label={`Remove ${l.label}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
      {!canManage ? (
        links.length ? null : <p className="px-4 py-6 text-sm text-ink-soft">Nothing here yet.</p>
      ) : adding ? (
        <LinkForm kind={kind} saveLabel="Add link" busy={busy} onCancel={() => setAdding(false)} onSave={(v) => run(() => addLinkAction(slug, kind, v), () => setAdding(false))} />
      ) : (
        <button onClick={() => (setEditing(null), setAdding(true))} className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-sm text-ink-soft hover:bg-hover hover:text-ink">
          <Plus size={16} /> {links.length ? w.addMore : w.addFirst}
        </button>
      )}
    </div>
  );
}
