"use client";

import { useState, useTransition } from "react";
import { Copy, Check } from "lucide-react";
import { disconnectJobberAction, saveJobberAppAction, testJobberAction } from "@/app/actions";
import type { FieldTool } from "@/db/schema";
import { FIELD_TOOL_INFO } from "@/lib/field-tools";

type Jobber = { connected: boolean; manual: boolean; accountName: string | null; connectedAt: string | null; lastError: string | null; appConfigured: boolean };

export function IntegrationsPanel({ slug, fieldTool, jobber, redirectUri, isAppAdmin, notice, error }: { slug: string; fieldTool: FieldTool; jobber: Jobber; redirectUri: string; isAppAdmin: boolean; notice?: string; error?: string }) {
  const tool = FIELD_TOOL_INFO[fieldTool];
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(error ? { ok: false, text: error } : notice ? { ok: true, text: notice } : null);
  const [busy, start] = useTransition();
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-3 space-y-4 text-sm">
      {msg && <p className={`rounded-lg px-3 py-2 ${msg.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}

      {fieldTool === "none" && (
        <div className="rounded-xl border border-dashed border-line p-4 text-ink-soft">
          This company has no field-service software set. Choose Jobber or GorillaDesk under Settings → Workspace to get a live jobs tile.
        </div>
      )}

      {fieldTool !== "none" && (
      <div className="rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl">{tool.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{tool.label}</div>
            <div className="text-xs text-ink-faint">
              {jobber.connected
                ? jobber.manual
                  ? `Fed by ${jobber.accountName ?? "Claude"}'s scheduled daily update. The dashboard tile shows the latest push.`
                  : `Connected${jobber.accountName ? ` as ${jobber.accountName}` : ""}${jobber.connectedAt ? ` · ${new Date(jobber.connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`
                : `Not fed yet. Powers the ${tool.label} tile on the dashboard: today's schedule, ${tool.words.requests.toLowerCase()}, ${tool.words.quotes.toLowerCase()}, overdue invoices. Claude's scheduled daily task fills it in.`}
            </div>
            {jobber.lastError && <div className="mt-1 text-xs text-warn">Last problem: {jobber.lastError}</div>}
          </div>
          {jobber.connected ? (
            <>
              <button
                disabled={busy || jobber.manual}
                onClick={() =>
                  start(async () => {
                    const r = await testJobberAction(slug);
                    setMsg(r.ok ? { ok: true, text: r.message ?? "OK" } : { ok: false, text: r.error });
                  })
                }
                className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-hover disabled:opacity-50"
              >
                {busy ? "Testing…" : "Test connection"}
              </button>
              <button disabled={busy} onClick={() => confirm("Disconnect Jobber? The dashboard tile stops updating.") && start(() => disconnectJobberAction(slug))} className="rounded-lg px-2 py-1.5 text-xs text-ink-soft hover:bg-hover">
                Disconnect
              </button>
            </>
          ) : fieldTool === "jobber" && jobber.appConfigured ? (
            <a href={`/api/integrations/jobber/connect?slug=${slug}`} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-paper">
              Connect Jobber
            </a>
          ) : null}
        </div>
      </div>
      )}

      {isAppAdmin && fieldTool === "jobber" && (
        <details className="rounded-xl border border-line p-4" open={!jobber.appConfigured && !jobber.connected}>
          <summary className="cursor-pointer font-medium">{jobber.appConfigured ? "Jobber app keys (set)" : "Optional: a direct Jobber connection (needs a Jobber Developer Center app)"}</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-soft">
            <li>
              Go to{" "}
              <a href="https://developer.getjobber.com/" target="_blank" rel="noreferrer" className="text-accent underline">
                developer.getjobber.com
              </a>
              , sign in with your Jobber login, and click <strong>New app</strong>.
            </li>
            <li>Name it &quot;Orbit&quot;. Developer name and description can be anything.</li>
            <li>
              Set the <strong>Callback / redirect URL</strong> to:
              <div className="mt-1 flex items-center gap-2">
                <code className="truncate rounded bg-paper px-2 py-1 text-xs">{redirectUri}</code>
                <button type="button" onClick={() => navigator.clipboard.writeText(redirectUri).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))} className="rounded p-1 text-ink-faint hover:bg-hover hover:text-ink" title="Copy">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </li>
            <li>
              Under <strong>Scopes</strong>, tick read access for Clients, Requests, Quotes, Jobs, Invoices, Scheduled items and Users. Turn on <strong>refresh token rotation</strong> if it&apos;s offered.
            </li>
            <li>Save, then copy the <strong>Client ID</strong> and <strong>Client Secret</strong> here.</li>
          </ol>
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await saveJobberAppAction(clientId, secret);
                setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
                if (r.ok) {
                  setClientId("");
                  setSecret("");
                }
              });
            }}
          >
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs" />
            <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Client secret" type="password" className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs" />
            <button disabled={busy || !clientId.trim() || !secret.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-50">
              Save keys
            </button>
          </form>
        </details>
      )}

      <div className="rounded-xl border border-dashed border-line p-4 text-ink-soft">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💬</span>
          <div>
            <div className="font-medium text-ink">Slack</div>
            <div className="text-xs">Coming next: a live channel feed on the dashboard and task reminders posted to Slack. For now, Slack is a button in the Tools tile.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
