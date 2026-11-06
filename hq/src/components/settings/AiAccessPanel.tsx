"use client";

import { useState, useTransition } from "react";
import { Bot, Copy, Check, Plus } from "lucide-react";
import { createApiKeyAction, revokeGrantAction } from "@/app/actions";

type Grant = { id: string; name: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; clientName: string | null; userName: string | null };
type Scope = { key: string; label: string; help: string };

const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

export function AiAccessPanel({ slug, grants, scopeInfo, mcpUrl }: { slug: string; grants: Grant[]; scopeInfo: Scope[]; mcpUrl: string }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const active = grants.filter((g) => !g.revokedAt);

  const copy = (what: string, v: string) => navigator.clipboard.writeText(v).then(() => (setCopied(what), setTimeout(() => setCopied(null), 1500)));

  return (
    <div className="mt-3 space-y-4">
      <div className="rounded-xl border border-line p-4 text-sm">
        <div className="flex items-start gap-3">
          <Bot size={20} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Connect Claude or another AI tool</div>
            <p className="mt-1 text-ink-soft">In claude.ai: Settings → Connectors → Add custom connector, paste this address, then click Allow when Orbit asks. Each connection shows up below and can be disconnected any time.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-paper px-2 py-1 text-xs">{mcpUrl}</code>
              <button onClick={() => copy("url", mcpUrl)} className="rounded p-1 text-ink-faint hover:bg-hover hover:text-ink" title="Copy">
                {copied === "url" ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ul className="divide-y divide-line rounded-xl border border-line">
        {active.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-faint">No AI tools connected to this company yet.</li>}
        {active.map((g) => (
          <li key={g.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{g.name}</div>
              <div className="text-xs text-ink-faint">
                {g.scopes.map((s) => scopeInfo.find((x) => x.key === s)?.label ?? s).join(" · ")} · connected by {g.userName ?? "?"} · last used {ago(g.lastUsedAt)}
              </div>
            </div>
            <button disabled={busy} onClick={() => confirm(`Disconnect "${g.name}"? It will lose access immediately.`) && start(() => revokeGrantAction(slug, g.id))} className="rounded px-2 py-1 text-danger hover:bg-danger-soft">
              Disconnect
            </button>
          </li>
        ))}
      </ul>

      {newKey ? (
        <div className="rounded-xl border border-ok bg-ok-soft p-4 text-sm">
          <div className="font-medium text-ok">Your new API key. Copy it now; it won&apos;t be shown again.</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="break-all rounded bg-paper px-2 py-1 text-xs">{newKey}</code>
            <button onClick={() => copy("key", newKey)} className="rounded p-1 text-ink-faint hover:bg-hover hover:text-ink" title="Copy">
              {copied === "key" ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-soft">Use it as a Bearer token against {mcpUrl}. For Claude Code: <code>claude mcp add --transport http orbit {mcpUrl} --header &quot;Authorization: Bearer &lt;key&gt;&quot;</code></p>
          <button onClick={() => setNewKey(null)} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-hover">
            Done
          </button>
        </div>
      ) : creating ? (
        <div className="rounded-xl border border-line p-4 text-sm">
          <div className="font-medium">New API key</div>
          <p className="mt-1 text-xs text-ink-soft">For tools that can&apos;t do the Allow flow (scripts, Claude Code, Zapier). The key is tied to this company only.</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder='Name, e.g. "Claude Code on Andrew’s laptop"' className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2" />
          <div className="mt-3 space-y-1">
            {scopeInfo.map((s) => (
              <label key={s.key} className="flex items-start gap-2">
                <input type="checkbox" checked={scopes.includes(s.key)} disabled={s.key === "read"} onChange={(e) => setScopes(e.target.checked ? [...scopes, s.key] : scopes.filter((x) => x !== s.key))} className="mt-1" />
                <span>
                  {s.label} <span className="text-xs text-ink-faint">— {s.help}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="rounded-lg px-3 py-1.5 hover:bg-hover">
              Cancel
            </button>
            <button
              disabled={busy || !name.trim()}
              onClick={() =>
                start(async () => {
                  const key = await createApiKeyAction(slug, name, scopes);
                  setNewKey(key);
                  setCreating(false);
                  setName("");
                  setScopes(["read"]);
                })
              }
              className="rounded-lg bg-accent px-3 py-1.5 font-medium text-paper disabled:opacity-50"
            >
              Create key
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm hover:bg-hover">
          <Plus size={14} /> Create an API key
        </button>
      )}
    </div>
  );
}
