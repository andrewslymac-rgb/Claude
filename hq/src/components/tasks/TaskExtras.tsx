"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ExternalLink, FileText, Image as ImageIcon, Link2, Loader2, Paperclip, PauseCircle, SkipForward, Trash2, Upload } from "lucide-react";
import { addTaskLinkAction, deleteTaskFileAction, listTaskFilesAction, moveDueAction, setTaskPausedAction } from "@/app/actions";
import { useToast } from "@/components/ui/Toast";
import type { TaskRow } from "@/lib/services/tasks";
import { todayISO } from "@/lib/recurrence";

type Status = "todo" | "done" | "skip" | "hold";

/**
 * One row of buttons for the task's status. Done and To do work for everyone (ticking off work);
 * Skip and On hold change the schedule, so they need "Manage tasks".
 */
export function StatusPicker({ slug, task, isDoneNow, canEdit, onDone, onUndo }: { slug: string; task: TaskRow; isDoneNow: boolean; canEdit: boolean; onDone: () => void; onUndo: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [resume, setResume] = useState<string | null>(null);
  const current: Status = task.pausedAt ? "hold" : isDoneNow ? "done" : "todo";

  const pick = (s: Status) => {
    if (s === current) return;
    if (s === "done") return onDone();
    if (s === "todo") {
      if (current === "hold") return setResume(todayISO());
      if (!task.canUndo) return toast("Done more than 7 days ago. Use Last done → change to correct it.", false);
      return onUndo();
    }
    start(async () => {
      if (s === "skip") {
        const to = await moveDueAction(slug, task.id);
        toast(to ? `Skipped. Next due ${new Date(`${to}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Skipped");
      } else {
        await setTaskPausedAction(slug, task.id, true);
        toast("On hold. It won't show as due or overdue until you resume it.");
      }
      router.refresh();
    });
  };

  const opts: { key: Status; label: string; icon: React.ReactNode; needsEdit: boolean; hidden?: boolean }[] = [
    { key: "todo", label: current === "hold" ? "Resume" : "To do", icon: <Circle size={15} />, needsEdit: current === "hold" },
    { key: "done", label: "Done", icon: <CheckCircle2 size={15} />, needsEdit: false, hidden: current === "hold" },
    { key: "skip", label: "Skip this time", icon: <SkipForward size={15} />, needsEdit: true, hidden: current !== "todo" },
    { key: "hold", label: "On hold", icon: <PauseCircle size={15} />, needsEdit: true },
  ];

  return (
    <div className="mt-5">
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">Status</div>
      <div className="flex flex-wrap gap-2">
        {opts
          .filter((o) => !o.hidden && (!o.needsEdit || canEdit))
          .map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={busy}
              onClick={() => pick(o.key)}
              aria-pressed={current === o.key}
              className={`flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition ${current === o.key ? (o.key === "done" ? "border-ok bg-ok-soft text-ok" : o.key === "hold" ? "border-line bg-hover text-ink" : "border-accent bg-accent-soft text-accent") : "border-line hover:bg-hover"}`}
            >
              {o.icon} {o.label}
            </button>
          ))}
      </div>
      {resume !== null && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-side/40 p-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              await setTaskPausedAction(slug, task.id, false, resume);
              setResume(null);
              toast("Resumed");
              router.refresh();
            });
          }}
        >
          <label className="text-xs text-ink-faint">
            Next due on
            <input type="date" required value={resume} min={todayISO()} onChange={(e) => setResume(e.target.value)} className="ml-2 field w-auto py-1.5" />
          </label>
          <button disabled={busy} className="btn btn-primary btn-sm ml-auto">Resume task</button>
          <button type="button" onClick={() => setResume(null)} className="btn btn-ghost btn-sm">Cancel</button>
        </form>
      )}
    </div>
  );
}

type FileRow = Awaited<ReturnType<typeof listTaskFilesAction>>[number];
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Photos, PDFs and other files on a task, plus links (e.g. a Google Doc). Anyone in the company can add. */
export function Attachments({ slug, taskId, canManage }: { slug: string; taskId: string; canManage: boolean }) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [uploading, setUploading] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState({ name: "", url: "" });
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const base = `/api/w/${slug}/tasks/${taskId}/files`;
  const reload = () => listTaskFilesAction(slug, taskId).then(setFiles);
  useEffect(() => {
    listTaskFilesAction(slug, taskId).then(setFiles);
  }, [slug, taskId]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    const all = Array.from(list);
    setUploading(all.length);
    for (const f of all) {
      if (f.size > 10 * 1024 * 1024) {
        toast(`${f.name} is over 10 MB. Put it in Google Drive and attach the link instead.`, false);
        setUploading((n) => n - 1);
        continue;
      }
      const body = new FormData();
      body.append("file", f);
      const res = await fetch(base, { method: "POST", body }).catch(() => null);
      if (!res || !res.ok) toast(`${f.name}: ${(await res?.json().catch(() => null))?.error ?? "upload failed"}`, false);
      setUploading((n) => n - 1);
    }
    if (input.current) input.current.value = "";
    reload();
  };

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
        <Paperclip size={12} /> Attachments {files && files.length > 0 && <span className="rounded-full bg-hover px-1.5 text-[10px] normal-case">{files.length}</span>}
      </div>
      {files && files.length > 0 && (
        <ul className="mb-2 divide-y divide-line rounded-lg border border-line">
          {files.map((f) => {
            const img = f.mimeType?.startsWith("image/") && !/hei[cf]/i.test(f.mimeType);
            const href = f.url ?? `${base}/${f.id}`;
            return (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={href} alt="" className="h-10 w-10 shrink-0 rounded object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-hover text-ink-faint">
                      {f.url ? <Link2 size={16} /> : f.mimeType?.startsWith("image/") ? <ImageIcon size={16} /> : <FileText size={16} />}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-accent">{f.name}</span>
                    <span className="block text-xs text-ink-faint">
                      {f.url ? "Link" : kb(f.size)} · {f.by ?? "Someone"} · {new Date(f.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}
                    </span>
                  </span>
                </a>
                {f.url && <ExternalLink size={14} className="shrink-0 text-ink-faint" />}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => confirm(`Remove "${f.name}"?`) && start(async () => { const r = await deleteTaskFileAction(slug, taskId, f.id); if (!r.ok) toast(r.error, false); reload(); })}
                  className="tap-icon shrink-0 rounded p-1.5 text-ink-faint hover:text-danger"
                  aria-label={`Remove ${f.name}`}
                  title={canManage ? "Remove" : "Remove (only if you added it)"}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {files && files.length === 0 && <p className="mb-2 text-xs text-ink-faint">No attachments yet. Add a photo of the finished job, a receipt, a PDF, or a link to a Google Doc.</p>}
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,audio/*,video/mp4,video/quicktime" />
        <button type="button" onClick={() => input.current?.click()} disabled={uploading > 0} className="btn btn-secondary btn-sm">
          {uploading > 0 ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {uploading > 0 ? `Uploading ${uploading}…` : "Add file or photo"}
        </button>
        <button type="button" onClick={() => setLinkOpen((o) => !o)} className="btn btn-ghost btn-sm">
          <Link2 size={14} /> Add link
        </button>
      </div>
      {linkOpen && (
        <form
          className="mt-2 space-y-2 rounded-lg border border-line bg-side/40 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addTaskLinkAction(slug, taskId, link.name, link.url);
              if (!r.ok) return toast(r.error, false);
              setLink({ name: "", url: "" });
              setLinkOpen(false);
              reload();
            });
          }}
        >
          <input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://docs.google.com/…" inputMode="url" className="field" />
          <input value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} placeholder="Name (optional)" maxLength={160} className="field" />
          <div className="flex justify-end">
            <button disabled={busy || !link.url.trim()} className="btn btn-primary btn-sm">Attach link</button>
          </div>
        </form>
      )}
    </div>
  );
}
