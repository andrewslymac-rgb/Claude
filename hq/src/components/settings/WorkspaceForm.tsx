"use client";

import { useState, useTransition } from "react";
import { updateWorkspaceAction } from "@/app/actions";
import type { FieldTool } from "@/db/schema";

const FIELD_TOOLS: { key: FieldTool; label: string; hint: string }[] = [
  { key: "jobber", label: "🗓️ Jobber", hint: "Scheduling, quotes and invoices in Jobber" },
  { key: "gorilladesk", label: "🦍 GorillaDesk", hint: "Scheduling, estimates and invoices in GorillaDesk" },
  { key: "none", label: "None", hint: "No field-service software (no live jobs tile)" },
];

const COLORS = ["#6366f1", "#8b5cf6", "#16a34a", "#0ea5e9", "#f59e0b", "#ef4444", "#64748b"];

export function WorkspaceForm({ slug, name: n0, icon: i0, color: c0, fieldTool: f0 }: { slug: string; name: string; icon: string; color: string; fieldTool: FieldTool }) {
  const [name, setName] = useState(n0);
  const [icon, setIcon] = useState(i0);
  const [color, setColor] = useState(c0);
  const [fieldTool, setFieldTool] = useState<FieldTool>(f0);
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();
  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateWorkspaceAction(slug, { name, icon, color, fieldTool });
          setMsg(r.ok ? "Saved. The sidebar, buttons and badges now use this color." : r.error);
        });
      }}
    >
      <div className="flex gap-2">
        <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="w-14 rounded-lg border border-line px-2 py-2 text-center text-lg" aria-label="Icon" />
        <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-lg border border-line px-3 py-2" aria-label="Name" />
      </div>
      <div className="flex items-center gap-2">
        {COLORS.map((c) => (
          <button type="button" key={c} onClick={() => setColor(c)} className={`h-7 w-7 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-offset-card" : ""}`} style={{ background: c, ["--tw-ring-color" as string]: c }} aria-label={`Color ${c}`} />
        ))}
        <button disabled={busy} className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper disabled:opacity-50">
          Save
        </button>
      </div>
      <div className="border-t border-line pt-3">
        <div className="text-sm font-medium">Field-service software</div>
        <p className="text-xs text-ink-soft">Which app runs the schedule, quotes and invoices for this company. The dashboard&apos;s live jobs tile and the Tools launcher follow this.</p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
          {FIELD_TOOLS.map((t) => (
            <button type="button" key={t.key} onClick={() => setFieldTool(t.key)} className={`rounded-lg border p-2 text-left text-sm ${fieldTool === t.key ? "border-accent bg-accent-soft" : "border-line hover:bg-hover"}`}>
              <div className="font-medium">{t.label}</div>
              <div className="text-xs text-ink-faint">{t.hint}</div>
            </button>
          ))}
        </div>
      </div>
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </form>
  );
}
