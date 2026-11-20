"use client";

import { useState } from "react";
import { Check, Loader2, Upload } from "lucide-react";

type Item = { name: string; state: "sending" | "done" | "failed"; error?: string };

export function AttachUploader({ token, taskHref }: { token: string; taskHref: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const busy = items.some((i) => i.state === "sending");
  const send = async (list: FileList | null) => {
    for (const f of Array.from(list ?? [])) {
      setItems((x) => [...x, { name: f.name, state: "sending" }]);
      const set = (patch: Partial<Item>) => setItems((x) => x.map((i) => (i.name === f.name && i.state === "sending" ? { ...i, ...patch } : i)));
      if (f.size > 10 * 1024 * 1024) {
        set({ state: "failed", error: "Over 10 MB" });
        continue;
      }
      try {
        const body = new FormData();
        body.append("file", f);
        const r = await fetch(`/api/attach/${token}`, { method: "POST", body });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        set(r.ok ? { state: "done" } : { state: "failed", error: j.error ?? "Couldn't upload" });
      } catch {
        set({ state: "failed", error: "Connection problem" });
      }
    }
  };
  return (
    <div className="mt-5">
      <label className={`btn btn-primary w-full cursor-pointer justify-center ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {busy ? "Uploading…" : items.length ? "Add another" : "Choose photos or files"}
        <input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,video/*,audio/*" className="hidden" onChange={(e) => { void send(e.target.files); e.target.value = ""; }} />
      </label>
      {items.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {items.map((i, n) => (
            <li key={n} className="flex items-center gap-2">
              {i.state === "done" ? <Check size={15} className="shrink-0 text-ok" /> : i.state === "sending" ? <Loader2 size={15} className="shrink-0 animate-spin text-ink-faint" /> : <span className="shrink-0 text-danger">!</span>}
              <span className="min-w-0 flex-1 truncate">{i.name}</span>
              {i.error && <span className="shrink-0 text-xs text-danger">{i.error}</span>}
            </li>
          ))}
        </ul>
      )}
      {items.some((i) => i.state === "done") && !busy && (
        <a href={taskHref} className="mt-4 block text-center text-sm text-accent">
          Open the task in Orbit
        </a>
      )}
      <p className="mt-4 text-xs text-ink-faint">Up to 10 MB each. This link works for an hour.</p>
    </div>
  );
}
