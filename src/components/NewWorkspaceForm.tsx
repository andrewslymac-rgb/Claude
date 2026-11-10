"use client";

import { useState, useTransition } from "react";
import { createWorkspaceAction } from "@/app/actions";

const COLORS = ["#6366f1", "#8b5cf6", "#16a34a", "#0ea5e9", "#f59e0b", "#ef4444", "#64748b"];

export function NewWorkspaceForm({ onDone }: { onDone?: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏢");
  const [color, setColor] = useState(COLORS[0]);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await createWorkspaceAction({ name, icon, color });
            onDone?.();
          } catch (err) {
            // redirect() throws on success; only show real errors
            if (!(err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) setError((err as Error).message);
          }
        });
      }}
    >
      <div className="flex gap-2">
        <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="w-14 rounded-lg border border-line px-2 py-2 text-center text-lg" aria-label="Icon (emoji)" />
        <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Company name" className="flex-1 rounded-lg border border-line px-3 py-2" autoFocus />
      </div>
      <div className="flex gap-2">
        {COLORS.map((c) => (
          <button type="button" key={c} onClick={() => setColor(c)} className={`h-7 w-7 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-offset-card" : ""}`} style={{ background: c, ["--tw-ring-color" as string]: c }} aria-label={`Color ${c}`} />
        ))}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button disabled={pending || !name.trim()} className="w-full btn btn-primary">
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}

export function NewWorkspaceDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={onClose}>
      <div className="w-full max-w-sm card p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">New workspace</h2>
        <NewWorkspaceForm onDone={onClose} />
      </div>
    </div>
  );
}
