"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setMyNameAction } from "@/app/actions";

/**
 * Asks for a first and last name. Shown on its own the first time someone signs in
 * without one (it can't be skipped), and from the sidebar when someone wants to fix theirs.
 */
export function NamePrompt({ first = "", last = "", required = false, onClose }: { first?: string; last?: string; required?: boolean; onClose?: () => void }) {
  const router = useRouter();
  const [f, setF] = useState(first);
  const [l, setL] = useState(last);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={required ? undefined : onClose}>
      <form
        className="pb-safe max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-line bg-card p-6 shadow-2xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await setMyNameAction(f, l);
            if (!r.ok) return setError(r.error);
            router.refresh();
            onClose?.();
          });
        }}
      >
        <h2 className="text-lg font-semibold">{required ? "Welcome! What's your name?" : "Your name"}</h2>
        <p className="mt-1 text-sm text-ink-soft">This is how your team sees you on tasks, notes and change logs.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="text-xs text-ink-faint">
            First name
            <input autoFocus required value={f} onChange={(e) => setF(e.target.value)} autoComplete="given-name" className="field mt-1" />
          </label>
          <label className="text-xs text-ink-faint">
            Last name
            <input required value={l} onChange={(e) => setL(e.target.value)} autoComplete="family-name" className="field mt-1" />
          </label>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          {!required && (
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
          )}
          <button disabled={busy || !f.trim() || !l.trim()} className="btn btn-primary">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
