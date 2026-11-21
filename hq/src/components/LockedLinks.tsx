"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, KeyRound, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { addLockedLinkAction, lockLockedAction, resetLockedAction, setLockedPinAction, takeOutLockedLinkAction, unlockLockedAction, updateLockedLinkAction } from "@/app/locked-actions";
import { useToast } from "@/components/ui/Toast";

type Link = { id: string; label: string; url: string; description?: string };
type Res = { ok: true } | { ok: false; error: string };

/** `links` is null while locked: the server only sends them after the PIN is entered on this browser. */
export function LockedLinks({ slug, pinSet, links, minutes }: { slug: string; pinSet: boolean; links: Link[] | null; minutes: number }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const toast = useToast();
  const router = useRouter();
  const go = (fn: () => Promise<Res>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setError("");
      after?.();
      router.refresh();
    });

  // Lock the screen when the unlock runs out, and when the tab has been in the background that long.
  useEffect(() => {
    if (!links) return;
    const t = setTimeout(() => router.refresh(), minutes * 60_000 + 2000);
    return () => clearTimeout(t);
  }, [links, minutes, router]);

  if (!pinSet) return <SetPin busy={busy} error={error} onSet={(pin) => go(() => setLockedPinAction(slug, pin), () => toast("PIN set. Add your first link."))} />;
  if (!links) return <Unlock busy={busy} error={error} onUnlock={(pin) => go(() => unlockLockedAction(slug, pin))} onReset={() => go(() => resetLockedAction(slug), () => toast("Reset. Set a new PIN."))} />;
  return <List slug={slug} links={links} busy={busy} error={error} go={go} minutes={minutes} />;
}

function PinInput({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      aria-label={label}
      placeholder={label}
      className="field text-center text-lg tracking-[0.4em]"
    />
  );
}

function SetPin({ busy, error, onSet }: { busy: boolean; error: string; onSet: (pin: string) => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const mismatch = b.length >= a.length && a !== b && b.length > 0;
  return (
    <form className="card mx-auto max-w-sm space-y-3 p-6" onSubmit={(e) => { e.preventDefault(); if (a === b) onSet(a); }}>
      <h2 className="flex items-center gap-2 font-semibold"><KeyRound size={16} className="text-accent" /> Choose a PIN</h2>
      <p className="text-sm text-ink-soft">4 to 8 digits. You&apos;ll enter it each time you open Locked Links. One PIN covers all your companies.</p>
      <PinInput value={a} onChange={setA} label="New PIN" autoFocus />
      <PinInput value={b} onChange={setB} label="Type it again" />
      {(mismatch || error) && <p className="text-sm text-danger">{mismatch ? "Those don't match." : error}</p>}
      <button disabled={busy || a.length < 4 || a !== b} className="btn btn-primary w-full justify-center">Set PIN</button>
      <p className="text-xs text-ink-faint">If you forget it, the only way back in is a reset, which erases your locked links.</p>
    </form>
  );
}

function Unlock({ busy, error, onUnlock, onReset }: { busy: boolean; error: string; onUnlock: (pin: string) => void; onReset: () => void }) {
  const [pin, setPin] = useState("");
  return (
    <form className="card mx-auto max-w-sm space-y-3 p-6 text-center" onSubmit={(e) => { e.preventDefault(); onUnlock(pin); setPin(""); }}>
      <Lock size={28} className="mx-auto text-accent" />
      <h2 className="font-semibold">Enter your PIN</h2>
      <PinInput value={pin} onChange={setPin} label="PIN" autoFocus />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button disabled={busy || pin.length < 4} className="btn btn-primary w-full justify-center">Unlock</button>
      <button
        type="button"
        onClick={() => prompt('Forgot your PIN? A reset erases every locked link you have, in all your companies. Type RESET to do it.')?.trim().toUpperCase() === "RESET" && onReset()}
        className="text-xs text-ink-faint hover:text-ink"
      >
        Forgot PIN
      </button>
    </form>
  );
}

function List({ slug, links, busy, error, go, minutes }: { slug: string; links: Link[]; busy: boolean; error: string; go: (fn: () => Promise<Res>, after?: () => void) => void; minutes: number }) {
  const [editing, setEditing] = useState<string | "new" | null>(links.length ? null : "new");
  const [changePin, setChangePin] = useState(false);
  const [pin, setPin] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-faint">Unlocked on this device. Locks itself after {minutes} minutes without changes.</span>
        <span className="ml-auto flex gap-2">
          <button onClick={() => setChangePin((o) => !o)} className="btn btn-sm"><KeyRound size={14} /> Change PIN</button>
          <button disabled={busy} onClick={() => go(() => lockLockedAction(slug))} className="btn btn-sm"><Lock size={14} /> Lock now</button>
        </span>
      </div>
      {changePin && (
        <form className="card flex flex-wrap items-center gap-2 p-3" onSubmit={(e) => { e.preventDefault(); go(() => setLockedPinAction(slug, pin), () => { setPin(""); setChangePin(false); }); }}>
          <div className="w-44"><PinInput value={pin} onChange={setPin} label="New PIN" autoFocus /></div>
          <button disabled={busy || pin.length < 4} className="btn btn-primary btn-sm">Save new PIN</button>
        </form>
      )}
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <ul className="card divide-y divide-line">
        {links.map((l) =>
          editing === l.id ? (
            <li key={l.id} className="p-3">
              <LinkForm initial={l} busy={busy} onCancel={() => setEditing(null)} onSave={(v) => go(() => updateLockedLinkAction(slug, l.id, v), () => setEditing(null))} />
            </li>
          ) : (
            <li key={l.id} className="flex items-start gap-3 px-4 py-3">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium text-accent">{l.label} <ExternalLink size={12} className="shrink-0" /></span>
                {l.description && <span className="mt-0.5 block text-sm text-ink-soft">{l.description}</span>}
                <span className="mt-0.5 block truncate text-xs text-ink-faint">{l.url.replace(/^https?:\/\//, "")}</span>
              </a>
              <button onClick={() => setEditing(l.id)} className="tap-icon rounded p-1.5 text-ink-faint hover:bg-hover hover:text-ink" aria-label={`Edit ${l.label}`}><Pencil size={15} /></button>
              <button disabled={busy} onClick={() => confirm(`Remove "${l.label}"?`) && go(() => takeOutLockedLinkAction(slug, l.id))} className="tap-icon rounded p-1.5 text-ink-faint hover:bg-hover hover:text-danger" aria-label={`Remove ${l.label}`}><Trash2 size={15} /></button>
            </li>
          ),
        )}
        {links.length === 0 && editing !== "new" && <li className="px-4 py-8 text-center text-sm text-ink-faint">No locked links yet.</li>}
        {editing === "new" && (
          <li className="p-3">
            <LinkForm busy={busy} onCancel={links.length ? () => setEditing(null) : undefined} onSave={(v) => go(() => addLockedLinkAction(slug, v), () => setEditing(null))} />
          </li>
        )}
      </ul>
      {editing !== "new" && (
        <button onClick={() => setEditing("new")} className="btn btn-sm"><Plus size={14} /> Add a locked link</button>
      )}
    </div>
  );
}

function LinkForm({ initial, busy, onSave, onCancel }: { initial?: Link; busy: boolean; onSave: (v: { label: string; url: string; description?: string }) => void; onCancel?: () => void }) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); onSave({ label, url, description }); }}>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name" maxLength={80} className="field" aria-label="Name" autoFocus />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" className="field" aria-label="Link" />
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it's for (optional)" maxLength={300} className="field" aria-label="Description" />
      <div className="flex gap-2">
        <button disabled={busy || !url.trim()} className="btn btn-primary btn-sm">{initial ? "Save" : "Add link"}</button>
        {onCancel && <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">Cancel</button>}
      </div>
    </form>
  );
}
