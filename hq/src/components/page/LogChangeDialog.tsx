"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { logChangeAction } from "@/app/actions";

/** Records a change-log entry (what/why/team told) as a new version of the page. */
export function LogChangeDialog({ slug, pageId, currentVersionLabel, isDrive = false, onClose, onSaved }: { slug: string; pageId: string; currentVersionLabel: string | null; isDrive?: boolean; onClose: () => void; onSaved?: () => void }) {
  const [note, setNote] = useState("");
  const [why, setWhy] = useState("");
  const [teamTold, setTeamTold] = useState(false);
  const [docVersion, setDocVersion] = useState(currentVersionLabel ?? "");
  const [toDrive, setToDrive] = useState(true);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const field = "field";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div className="pb-safe max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Log a change</h2>
          <button onClick={onClose} className="tap-icon rounded p-1 hover:bg-hover" aria-label="Close">
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
        {isDrive && (
          <label className="mt-3 flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={toDrive} onChange={(e) => setToDrive(e.target.checked)} />
            <span>
              Also add it to the Google Doc
              <span className="block text-xs text-ink-faint">Adds a line under a &ldquo;Change log&rdquo; heading at the bottom of the original.</span>
            </span>
          </label>
        )}
        {driveError ? (
          <div className="mt-4">
            <div className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              Saved in Orbit, but it couldn&rsquo;t be added to the Google Doc. {driveError}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={onClose} className="btn btn-primary">
                OK
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button
              disabled={busy || !note.trim()}
              onClick={() =>
                start(async () => {
                  const r = await logChangeAction(slug, pageId, { note, why: why || undefined, teamTold, docVersion: docVersion || null, writeToDrive: isDrive && toDrive });
                  onSaved?.();
                  if (typeof r.drive === "object") setDriveError(r.drive.error);
                  else onClose();
                })
              }
              className="btn btn-primary"
            >
              {busy ? "Saving…" : "Save to change log"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
