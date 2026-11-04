"use client";

import { useState, useTransition } from "react";
import { updateWorkspaceAction } from "@/app/actions";

const COLORS = ["#6366f1", "#8b5cf6", "#16a34a", "#0ea5e9", "#f59e0b", "#ef4444", "#64748b"];

export function WorkspaceForm({ slug, name: n0, icon: i0, color: c0 }: { slug: string; name: string; icon: string; color: string }) {
  const [name, setName] = useState(n0);
  const [icon, setIcon] = useState(i0);
  const [color, setColor] = useState(c0);
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();
  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateWorkspaceAction(slug, { name, icon, color });
          setMsg(r.ok ? "Saved." : r.error);
        });
      }}
    >
      <div className="flex gap-2">
        <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="w-14 rounded-lg border border-line px-2 py-2 text-center text-lg" aria-label="Icon" />
        <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-lg border border-line px-3 py-2" aria-label="Name" />
      </div>
      <div className="flex items-center gap-2">
        {COLORS.map((c) => (
          <button type="button" key={c} onClick={() => setColor(c)} className={`h-7 w-7 rounded-full ${color === c ? "ring-2 ring-offset-2" : ""}`} style={{ background: c, ["--tw-ring-color" as string]: c }} aria-label={`Color ${c}`} />
        ))}
        <button disabled={busy} className="ml-auto rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Save
        </button>
      </div>
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </form>
  );
}
