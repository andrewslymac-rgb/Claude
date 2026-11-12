"use client";

import { useState, useTransition } from "react";
import { Bell, Mail, Sunrise } from "lucide-react";
import { setMyNotificationsAction, setMyWorkspaceEmailAction } from "@/app/actions";
import { useToast } from "@/components/ui/Toast";

/** The signed-in person's own email preferences. Applies across every company they're in. */
export function NotificationsPanel({ taskEmail: t0, digest: d0, email, slug, workspaceName, workspaceEmail }: { taskEmail: boolean; digest: boolean; email: string; slug: string; workspaceName: string; workspaceEmail: string | null }) {
  const [taskEmail, setTaskEmail] = useState(t0);
  const [digest, setDigest] = useState(d0);
  const [busy, start] = useTransition();
  const toast = useToast();
  const save = (patch: { taskEmail?: boolean; digest?: boolean }) =>
    start(async () => {
      const r = await setMyNotificationsAction({ taskEmail: patch.taskEmail ?? taskEmail, digest: patch.digest ?? digest });
      if (!r.ok) {
        toast(r.error, false);
        if (patch.taskEmail !== undefined) setTaskEmail(!patch.taskEmail);
        if (patch.digest !== undefined) setDigest(!patch.digest);
      }
    });
  const sendTo = workspaceEmail || email;
  return (
    <div className="card divide-y divide-line">
      <WorkspaceEmail slug={slug} workspaceName={workspaceName} signIn={email} current={workspaceEmail} />
      <Row icon={<Bell size={16} />} title="Email me when a task is added to my list" help={`Sent to ${sendTo} when someone assigns you a task or a role you hold.`} on={taskEmail} busy={busy} onChange={(v) => (setTaskEmail(v), save({ taskEmail: v }))} />
      <Row icon={<Sunrise size={16} />} title="Morning digest" help="A short email at 7 AM Pacific with what's due today and anything overdue, across your companies. Each company's tasks go to that company's address. Skipped on days with nothing to do." on={digest} busy={busy} onChange={(v) => (setDigest(v), save({ digest: v }))} />
    </div>
  );
}

function Row({ icon, title, help, on, busy, onChange }: { icon: React.ReactNode; title: string; help: string; on: boolean; busy: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
      <span className="mt-0.5 text-ink-faint">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-ink-soft">{help}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy}
        onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-line"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

/** Where emails about this one company go. Blank = the sign-in email. */
function WorkspaceEmail({ slug, workspaceName, signIn, current }: { slug: string; workspaceName: string; signIn: string; current: string | null }) {
  const [value, setValue] = useState(current ?? "");
  const [saved, setSaved] = useState(current ?? "");
  const [busy, start] = useTransition();
  const toast = useToast();
  const dirty = value.trim().toLowerCase() !== saved;
  const save = (v: string) =>
    start(async () => {
      const r = await setMyWorkspaceEmailAction(slug, v);
      if (!r.ok) return toast(r.error, false);
      const clean = v.trim().toLowerCase() === signIn.toLowerCase() ? "" : v.trim().toLowerCase();
      setValue(clean);
      setSaved(clean);
      toast(clean ? `${workspaceName} emails now go to ${clean}` : `${workspaceName} emails now go to ${signIn}`);
    });
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 text-ink-faint"><Mail size={16} /></span>
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Send my {workspaceName} emails to</span>
        <span className="block text-xs text-ink-soft">Just for this company. Leave blank to use your sign-in email ({signIn}).</span>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) save(value);
          }}
        >
          <input type="email" inputMode="email" autoComplete="email" value={value} onChange={(e) => setValue(e.target.value)} placeholder={signIn} className="field min-w-0 flex-1 basis-56" />
          <button type="submit" disabled={busy || !dirty} className="btn btn-primary">Save</button>
          {saved && (
            <button type="button" disabled={busy} onClick={() => save("")} className="btn">Use sign-in email</button>
          )}
        </form>
      </div>
    </div>
  );
}
