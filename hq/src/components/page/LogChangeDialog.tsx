"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { logChangeAction } from "@/app/actions";

/** Records a change-log entry (what/why/team told) as a new version of the page. */
export function LogChangeDialog({ slug, pageId, currentVersionLabel, onClose }: { slug: string; pageId: string; currentVersionLabel: string | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [why, setWhy] = useState("");
  const [teamTold, setTeamTold] = useState(false);
  const [docVersion, setDocVersion] = useState(currentVersionLabel ?? "");
  const [busy, start] = useTransition();
  const field = "field";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md card p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Log a change</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-hover" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-soft">Orbit already saves every edit. This adds a note for the team about what changed and why.</p>
        <label className="mt-4 block text-xs text-ink-faint">
          What changed
          <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={field} placeholder="e.g. Raised the cancellation window from 24 to 48 hours" />
        </label>
        <label className="mt-3 block text-xs text-ink-faint">
          Why
          <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} className={field} />
        </label>
        <div className="mt-3 flex items-center gap-3">
          <label className="text-xs text-ink-faint">
            Version label
            <input value={docVersion} onChange={(e) => setDocVersion(e.target.value)} placeholder="v2" className="mt-1 w-24 field w-auto py-1.5" />
          </label>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={teamTold} onChange={(e) => setTeamTold(e.target.checked)} /> Team has been told
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            disabled={busy || !note.trim()}
            onClick={() => start(async () => (await logChangeAction(slug, pageId, { note, why: why || undefined, teamTold, docVersion: docVersion || null }), onClose()))}
            className="btn btn-primary"
          >
            {busy ? "Saving…" : "Save to change log"}
          </button>
        </div>
      </div>
    </div>
  );
}
