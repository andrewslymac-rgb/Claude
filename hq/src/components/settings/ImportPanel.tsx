"use client";

import { useState, useTransition } from "react";
import { importNotionAction } from "@/app/actions";

export function ImportPanel({ slug }: { slug: string }) {
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className="mt-3 rounded-xl border border-line p-4 text-sm">
      <div className="font-medium">Import from the Notion Command Center</div>
      <p className="mt-1 text-ink-soft">Brings in the 63 recurring management tasks and 38 open flags. Tasks that already exist by name are skipped, so it&apos;s safe to run more than once. Documents come from Google Drive, not Notion.</p>
      <div className="mt-3 flex items-center gap-3">
        <button disabled={busy} onClick={() => start(async () => { const r = await importNotionAction(slug); setMsg(r.ok ? (r.message ?? "Done.") : r.error); })} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-50">
          {busy ? "Importing…" : "Import tasks and flags"}
        </button>
        {msg && <span className="text-ink-soft">{msg}</span>}
      </div>
    </div>
  );
}
