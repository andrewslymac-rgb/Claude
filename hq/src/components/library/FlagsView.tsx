"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createFlagAction, deleteFlagAction, updateFlagAction } from "@/app/actions";
import { FLAG_STATUS_LABELS, FLAG_TYPE_LABELS, type FlagSeverity, type FlagStatus, type FlagType } from "@/lib/flag-labels";
type FlagInput = { type: FlagType; severity: FlagSeverity; status?: FlagStatus };

type F = {
  id: string;
  title: string;
  type: FlagInput["type"];
  severity: FlagInput["severity"];
  status: NonNullable<FlagInput["status"]>;
  whoDecides: string | null;
  whatWeFound: string;
  nextStep: string;
  pageId: string | null;
  pageTitle: string | null;
  pageIcon: string | null;
  ownerName: string | null;
  foundAt: string;
  resolvedAt: string | null;
};
type PageOpt = { id: string; title: string; icon: string | null };

const SEV: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warn-soft text-warn", low: "bg-hover text-ink-soft" };
const WHO = ["Owners", "Office Manager", "Trainer", "Attorney or CPA review"];

export function FlagsView({ slug, flags, pages, canEdit }: { slug: string; flags: F[]; pages: PageOpt[]; canEdit: boolean }) {
  const [showClosed, setShowClosed] = useState(false);
  const [editing, setEditing] = useState<F | "new" | null>(null);
  const [, start] = useTransition();
  const visible = flags.filter((f) => showClosed || f.status === "open" || f.status === "in_progress");

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-10 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Flags & open questions</h1>
          <p className="mt-1 text-sm text-ink-soft">Contradictions, gaps and decisions waiting on someone. {flags.filter((f) => f.status === "open").length} open.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-ink-soft">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show resolved
          </label>
          {canEdit && (
            <button onClick={() => setEditing("new")} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-paper">
              <Plus size={16} /> New flag
            </button>
          )}
        </div>
      </div>

      <ul className="mt-5 space-y-2">
        {visible.length === 0 && <li className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-faint">No open flags. 🎉</li>}
        {visible.map((f) => (
          <li key={f.id} className="rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEV[f.severity]}`}>{f.severity[0].toUpperCase() + f.severity.slice(1)}</span>
              <span className="rounded bg-hover px-2 py-0.5 text-xs text-ink-soft">{FLAG_TYPE_LABELS[f.type]}</span>
              <button onClick={() => canEdit && setEditing(f)} className="min-w-0 flex-1 text-left font-medium hover:underline">
                {f.title}
              </button>
              {canEdit ? (
                <select value={f.status} onChange={(e) => start(() => updateFlagAction(slug, f.id, { status: e.target.value as F["status"] }))} className="rounded-md border border-line bg-paper px-2 py-1 text-xs">
                  {(Object.keys(FLAG_STATUS_LABELS) as F["status"][]).map((s) => (
                    <option key={s} value={s}>
                      {FLAG_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-ink-soft">{FLAG_STATUS_LABELS[f.status]}</span>
              )}
            </div>
            {f.whatWeFound && <p className="mt-2 text-sm text-ink-soft">{f.whatWeFound}</p>}
            {f.nextStep && (
              <p className="mt-1 text-sm">
                <span className="text-ink-faint">Next step:</span> {f.nextStep}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-ink-faint">
              {f.pageId && (
                <Link href={`/w/${slug}/p/${f.pageId}`} className="text-accent hover:underline">
                  {f.pageIcon ?? "📄"} {f.pageTitle}
                </Link>
              )}
              {f.whoDecides && <span>Decides: {f.whoDecides}</span>}
              {f.ownerName && <span>Owner: {f.ownerName}</span>}
              <span>Found {new Date(f.foundAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </div>
          </li>
        ))}
      </ul>

      {editing && <FlagForm slug={slug} flag={editing === "new" ? undefined : editing} pages={pages} onClose={() => setEditing(null)} />}
    </div>
  );
}

function FlagForm({ slug, flag, pages, onClose }: { slug: string; flag?: F; pages: PageOpt[]; onClose: () => void }) {
  const [v, setV] = useState({
    title: flag?.title ?? "",
    type: flag?.type ?? ("open_decision" as FlagInput["type"]),
    severity: flag?.severity ?? ("medium" as FlagInput["severity"]),
    whoDecides: flag?.whoDecides ?? "",
    whatWeFound: flag?.whatWeFound ?? "",
    nextStep: flag?.nextStep ?? "",
    pageId: flag?.pageId ?? "",
  });
  const [busy, start] = useTransition();
  const set = (k: keyof typeof v, val: string) => setV({ ...v, [k]: val });
  const field = "mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-card p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{flag ? "Edit flag" : "New flag"}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-hover" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <input autoFocus value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Short title" className={field} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-ink-faint">
              Type
              <select value={v.type} onChange={(e) => set("type", e.target.value)} className={field}>
                {(Object.keys(FLAG_TYPE_LABELS) as FlagInput["type"][]).map((t) => (
                  <option key={t} value={t}>
                    {FLAG_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-faint">
              Severity
              <select value={v.severity} onChange={(e) => set("severity", e.target.value)} className={field}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label className="text-xs text-ink-faint">
              Who decides
              <select value={v.whoDecides} onChange={(e) => set("whoDecides", e.target.value)} className={field}>
                <option value="">—</option>
                {WHO.map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-faint">
              Related page
              <select value={v.pageId} onChange={(e) => set("pageId", e.target.value)} className={field}>
                <option value="">None</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon ?? "📄"} {p.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs text-ink-faint">
            What we found
            <textarea value={v.whatWeFound} onChange={(e) => set("whatWeFound", e.target.value)} rows={3} className={field} />
          </label>
          <label className="block text-xs text-ink-faint">
            Suggested next step
            <textarea value={v.nextStep} onChange={(e) => set("nextStep", e.target.value)} rows={2} className={field} />
          </label>
        </div>
        <div className="mt-5 flex items-center gap-2">
          {flag && (
            <button onClick={() => confirm("Delete this flag?") && start(async () => (await deleteFlagAction(slug, flag.id), onClose()))} className="text-sm text-danger hover:underline">
              Delete
            </button>
          )}
          <button onClick={onClose} className="ml-auto rounded-lg px-4 py-2 text-sm hover:bg-hover">
            Cancel
          </button>
          <button
            disabled={busy || !v.title.trim()}
            onClick={() =>
              start(async () => {
                const input = { ...v, whoDecides: v.whoDecides || null, pageId: v.pageId || null };
                if (flag) await updateFlagAction(slug, flag.id, input);
                else await createFlagAction(slug, input);
                onClose();
              })
            }
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
