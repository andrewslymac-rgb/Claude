"use client";

import { useState, useTransition } from "react";
import { FolderSync, RefreshCw, Copy, Check } from "lucide-react";
import { connectDriveAction, disconnectDriveAction, syncDriveAction } from "@/app/actions";

type Conn = { folderId: string; folderName: string; lastSyncAt: string | null; lastSyncStatus: string | null; lastSyncCounts: { created: number; updated: number; trashed: number; skipped: number } | null; excludeFolderIds: string[] } | null;

export function DrivePanel({ slug, conn, serviceEmail, problem }: { slug: string; conn: Conn; serviceEmail: string | null; problem?: string | null }) {
  const [link, setLink] = useState("");
  const [exclude, setExclude] = useState(conn?.excludeFolderIds.join(", ") ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [copied, setCopied] = useState(false);

  if (!serviceEmail)
    return (
      <div className="mt-3 rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">
        {problem ? (
          <>
            <div className="font-medium text-warn">The Google key is set in Railway but Orbit can&apos;t read it.</div>
            <div className="mt-1">{problem}</div>
            <div className="mt-2 text-xs text-ink-faint">After fixing the value in Railway → Variables, click Deploy and reload this page.</div>
          </>
        ) : (
          <>
            Google Drive sync isn&apos;t set up on the server yet: the <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> variable is missing in Railway, or Railway hasn&apos;t been redeployed since it was added. Add it under web → Variables, then click Deploy.
          </>
        )}
      </div>
    );

  return (
    <div className="mt-3 space-y-4 text-sm">
      <div className="rounded-xl border border-line p-4">
        <div className="flex items-start gap-3">
          <FolderSync size={20} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">How it works</div>
            <p className="mt-1 text-ink-soft">
              Share your SOP folder (or the whole Shared Drive) with this address as <strong>Viewer</strong>, then paste the folder link below. Every Google Doc and Word file becomes a read-only page here and updates automatically within 10 minutes of a change in Drive. Edit the originals in Drive.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="truncate rounded bg-paper px-2 py-1 text-xs">{serviceEmail}</code>
              <button onClick={() => navigator.clipboard.writeText(serviceEmail).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))} className="rounded p-1 text-ink-faint hover:bg-hover hover:text-ink" title="Copy">
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {conn ? (
        <div className="rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">📁 {conn.folderName}</span>
            <span className="text-xs text-ink-faint">
              {conn.lastSyncAt ? `last synced ${new Date(conn.lastSyncAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "not synced yet"}
              {conn.lastSyncCounts && ` · ${conn.lastSyncCounts.created} new, ${conn.lastSyncCounts.updated} updated, ${conn.lastSyncCounts.trashed} removed`}
            </span>
            {conn.lastSyncStatus && conn.lastSyncStatus !== "ok" && <span className="rounded bg-danger-soft px-2 py-0.5 text-xs text-danger">{conn.lastSyncStatus}</span>}
            <button
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const r = await syncDriveAction(slug);
                  setMsg(r.ok ? { ok: true, text: r.message ?? "Synced." } : { ok: false, text: r.error });
                })
              }
              className="ml-auto flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-50"
            >
              <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> {busy ? "Syncing…" : "Sync now"}
            </button>
            <button disabled={busy} onClick={() => confirm("Disconnect Drive? Synced pages stay in Orbit but stop updating.") && start(() => disconnectDriveAction(slug))} className="rounded-lg px-2 py-1.5 text-xs text-ink-soft hover:bg-hover">
              Disconnect
            </button>
          </div>
        </div>
      ) : null}

      <form
        className="rounded-xl border border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await connectDriveAction(slug, link, exclude);
            setMsg(r.ok ? { ok: true, text: r.message ?? "Connected." } : { ok: false, text: r.error });
            if (r.ok) setLink("");
          });
        }}
      >
        <div className="font-medium">{conn ? "Change folder" : "Connect a folder"}</div>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste the Google Drive folder link" className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2" />
        <input value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="Folder links to skip (optional, comma separated)" className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs" />
        <div className="mt-3 flex justify-end">
          <button disabled={busy || !link.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-50">
            {busy ? "Working…" : conn ? "Save & sync" : "Connect & sync"}
          </button>
        </div>
      </form>
      {msg && <p className={`rounded-lg px-3 py-2 ${msg.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
