"use client";

import { useState, useTransition } from "react";
import { FolderSync, RefreshCw, Copy, Check, Plus, Pencil, Trash2, ExternalLink, ArrowLeftRight } from "lucide-react";
import { addCollectionAction, setTwoWayAction, removeCollectionAction, syncDriveAction, saveDriveKeyAction, updateCollectionAction } from "@/app/actions";
import type { CollectionKind } from "@/db/schema";

export type CollectionRow = {
  id: string;
  label: string;
  icon: string;
  kind: CollectionKind;
  folderIds: string[];
  folderNames: string[];
  excludeFolderIds: string[];
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncCounts: { created: number; updated: number; trashed: number; skipped: number } | null;
  count: number;
  twoWay?: boolean;
};
type KindInfo = Record<CollectionKind, { label: string; icon: string; hint: string }>;

export function DrivePanel({ slug, collections, kinds, serviceEmail, problem, isAppAdmin }: { slug: string; collections: CollectionRow[]; kinds: KindInfo; serviceEmail: string | null; problem?: string | null; isAppAdmin: boolean }) {
  const [keyText, setKeyText] = useState("");
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<CollectionRow | "new" | null>(null);

  const keyForm = isAppAdmin && (
    <form
      className="card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveDriveKeyAction(keyText);
          setKeyMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
          if (r.ok) setKeyText("");
        });
      }}
    >
      <div className="font-medium">{serviceEmail ? "Replace the Google key" : "Paste the Google key"}</div>
      <p className="mt-1 text-xs text-ink-soft">Open the .json file you downloaded from Google Cloud in TextEdit or Notepad, select all, copy, and paste it here. Orbit checks it immediately. It&apos;s stored on the server and never shown again.</p>
      <textarea value={keyText} onChange={(e) => setKeyText(e.target.value)} rows={4} placeholder='{ "type": "service_account", ... }' className="mt-2 field font-mono text-xs" />
      <div className="mt-2 flex items-center gap-3">
        <button disabled={busy || !keyText.trim()} className="btn btn-primary btn-sm">
          {busy ? "Checking…" : "Save key"}
        </button>
        {keyMsg && <span className={keyMsg.ok ? "text-ok" : "text-danger"}>{keyMsg.text}</span>}
      </div>
    </form>
  );

  if (!serviceEmail)
    return (
      <div className="mt-3 space-y-4 text-sm">
        <div className="rounded-xl border border-dashed border-line p-4 text-ink-soft">
          {problem ? (
            <>
              <div className="font-medium text-warn">A Google key is set but Orbit can&apos;t read it.</div>
              <div className="mt-1">{problem}</div>
            </>
          ) : (
            <>Google Drive sync isn&apos;t set up yet. Paste the service account key below to turn it on.</>
          )}
        </div>
        {keyForm}
      </div>
    );

  return (
    <div className="mt-3 space-y-4 text-sm">
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <FolderSync size={20} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">How it works</div>
            <p className="mt-1 text-ink-soft">
              Each <strong>document area</strong> (SOPs, Legal, Licensing…) mirrors one or more Drive folders as read-only pages, with its own entry in the sidebar. Share the folders with this address as <strong>Viewer</strong>. Titles match the file names in Drive, and changes show up within 10 minutes. Edit the originals in Drive.
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

      <div className="space-y-2">
        {collections.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl">{c.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {c.label} <span className="ml-1 text-xs font-normal text-ink-faint">{kinds[c.kind]?.label} · {c.count} documents</span>
                </div>
                <div className="truncate text-xs text-ink-faint">
                  {c.folderNames.map((n, i) => (
                    <a key={c.folderIds[i]} href={`https://drive.google.com/drive/folders/${c.folderIds[i]}`} target="_blank" rel="noreferrer" className="mr-2 inline-flex items-center gap-0.5 hover:text-ink">
                      📁 {n} <ExternalLink size={10} />
                    </a>
                  ))}
                </div>
                <div className="mt-0.5 text-xs text-ink-faint">
                  {c.lastSyncAt ? `synced ${new Date(c.lastSyncAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "not synced yet"}
                  {c.lastSyncCounts && ` · ${c.lastSyncCounts.created} new, ${c.lastSyncCounts.updated} updated, ${c.lastSyncCounts.trashed} removed`}
                  {c.lastSyncStatus && c.lastSyncStatus !== "ok" && <span className="ml-2 rounded bg-danger-soft px-1.5 py-0.5 text-danger">{c.lastSyncStatus}</span>}
                </div>
              </div>
              <button
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const r = await syncDriveAction(slug, c.id);
                    setMsg(r.ok ? { ok: true, text: r.message ?? "Synced." } : { ok: false, text: r.error });
                  })
                }
                className="flex items-center gap-1 btn btn-secondary btn-sm"
              >
                <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Sync
              </button>
              <button onClick={() => setEditing(c)} className="rounded-lg border border-line p-1.5 text-ink-soft hover:bg-hover" title="Edit">
                <Pencil size={13} />
              </button>
              <button
                disabled={busy}
                onClick={() => confirm(`Remove "${c.label}" from Orbit? Its pages go to Trash and stop updating. Nothing changes in Drive.`) && start(() => removeCollectionAction(slug, c.id))}
                className="rounded-lg border border-line p-1.5 text-ink-soft hover:bg-danger-soft hover:text-danger"
                title="Remove"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {c.kind === "sop" && (
              <label className={`mt-3 flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${c.twoWay ? "border-accent bg-accent-soft" : "border-line"}`}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={Boolean(c.twoWay)}
                  disabled={busy}
                  onChange={(e) => {
                    const on = e.target.checked;
                    if (on && !confirm(`Turn on two-way sync for "${c.label}"?\n\nGoogle Docs in this area become editable in Orbit, and Orbit's edits replace the Doc's text about a minute after someone stops typing. Doc comments, suggestions, images and complex layouts may be lost when Orbit writes. Trashing a page in Orbit also trashes the Doc (recoverable in Drive for 30 days).`)) return;
                    start(async () => {
                      const r = await setTwoWayAction(slug, c.id, on);
                      setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
                    });
                  }}
                />
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <ArrowLeftRight size={14} /> Two-way sync
                  </span>
                  <span className="block text-xs text-ink-faint">
                    {c.twoWay
                      ? "On. Edit these SOPs in Orbit or in Google Docs and the other side follows. New pages made here become Google Docs in this folder."
                      : "Off. Orbit shows these documents read-only and you edit them in Google Docs. Turn on to edit in Orbit too (Orbit needs Editor access to the folder)."}
                  </span>
                </span>
              </label>
            )}
          </div>
        ))}
        {collections.length === 0 && <div className="rounded-xl border border-dashed border-line p-4 text-ink-faint">No document areas yet. Add one for your SOPs, one for Legal, one for Licensing…</div>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setEditing("new")} className="flex items-center gap-1 btn btn-primary btn-sm">
          <Plus size={13} /> Add a document area
        </button>
        {collections.length > 1 && (
          <button
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await syncDriveAction(slug);
                setMsg(r.ok ? { ok: true, text: r.message ?? "Synced." } : { ok: false, text: r.error });
              })
            }
            className="flex items-center gap-1 btn btn-secondary btn-sm"
          >
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Sync all
          </button>
        )}
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 ${msg.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}

      {editing && (
        <CollectionForm
          slug={slug}
          kinds={kinds}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(text) => {
            setEditing(null);
            setMsg({ ok: true, text });
          }}
        />
      )}

      <details>
        <summary className="cursor-pointer text-xs text-ink-faint">Replace the Google key</summary>
        <div className="mt-2">{keyForm}</div>
      </details>
    </div>
  );
}

function CollectionForm({ slug, kinds, initial, onClose, onDone }: { slug: string; kinds: KindInfo; initial: CollectionRow | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [kind, setKind] = useState<CollectionKind>(initial?.kind ?? "sop");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [folders, setFolders] = useState(initial ? initial.folderIds.map((id) => `https://drive.google.com/drive/folders/${id}`).join("\n") : "");
  const [exclude, setExclude] = useState(initial ? initial.excludeFolderIds.map((id) => `https://drive.google.com/drive/folders/${id}`).join("\n") : "");
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <form
        className="pb-safe max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-card p-5 shadow-2xl sm:rounded-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setErr("");
          start(async () => {
            const input = { label, icon: icon || kinds[kind].icon, kind, folderLinks: lines(folders), excludeLinks: lines(exclude) };
            const r = initial ? await updateCollectionAction(slug, initial.id, input) : await addCollectionAction(slug, input);
            if (r.ok) onDone(r.message ?? "Saved.");
            else setErr(r.error);
          });
        }}
      >
        <h3 className="text-lg font-semibold">{initial ? "Edit document area" : "Add a document area"}</h3>
        <label className="mt-4 block text-sm font-medium">What kind of documents?</label>
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
          {(Object.keys(kinds) as CollectionKind[]).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => {
                setKind(k);
                if (!label || label === kinds[kind].label) setLabel(kinds[k].label);
                if (!icon || icon === kinds[kind].icon) setIcon(kinds[k].icon);
              }}
              className={`rounded-lg border p-2 text-left text-sm ${kind === k ? "border-accent bg-accent-soft" : "border-line hover:bg-hover"}`}
            >
              <div className="font-medium">
                {kinds[k].icon} {kinds[k].label}
              </div>
              <div className="text-xs text-ink-faint">{kinds[k].hint}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} placeholder={kinds[kind].icon} className="w-14 rounded-lg border border-line bg-paper px-2 py-2 text-center text-lg" aria-label="Icon" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kinds[kind].label} className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm" aria-label="Name in the sidebar" />
        </div>
        <label className="mt-3 block text-sm font-medium">Google Drive folder links</label>
        <p className="text-xs text-ink-faint">One per line. Several folders are shown as sections inside this area.</p>
        <textarea value={folders} onChange={(e) => setFolders(e.target.value)} rows={3} placeholder="https://drive.google.com/drive/folders/…" className="mt-1 field text-xs" />
        <label className="mt-3 block text-sm font-medium">Subfolders to skip (optional)</label>
        <p className="text-xs text-ink-faint">Links to folders inside the ones above that belong somewhere else.</p>
        <textarea value={exclude} onChange={(e) => setExclude(e.target.value)} rows={2} className="mt-1 field text-xs" />
        {err && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button disabled={busy || !lines(folders).length} className="btn btn-primary">
            {busy ? "Syncing…" : initial ? "Save & sync" : "Add & sync"}
          </button>
        </div>
      </form>
    </div>
  );
}
