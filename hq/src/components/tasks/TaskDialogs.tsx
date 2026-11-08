"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Undo2, X, Trash2, History, CalendarClock, SkipForward } from "lucide-react";
import { archiveTaskAction, createTaskAction, listCompletionsAction, moveDueAction, updateTaskAction } from "@/app/actions";
import type { TaskRow } from "@/lib/services/tasks";
import type { Frequency } from "@/db/schema";
import { DUE_LABELS, FREQUENCY_LABELS, fmtDate } from "@/lib/recurrence";

export type Member = { id: string; name: string };
export type PageOpt = { id: string; title: string; icon: string | null };

export const TONE: Record<string, string> = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  accent: "bg-accent-soft text-accent",
  muted: "bg-hover text-ink-soft",
  ok: "bg-ok-soft text-ok",
};

export function TaskDrawer({ slug, task, members, pages, categories, canEdit, onClose, onDone, onUndo }: { slug: string; task: TaskRow; members: Member[]; pages: PageOpt[]; categories: readonly string[]; canEdit: boolean; onClose: () => void; onDone: (t: TaskRow) => void; onUndo: (t: TaskRow) => void }) {
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof listCompletionsAction>> | null>(null);
  const [, start] = useTransition();
  if (editing) return <TaskForm slug={slug} task={task} members={members} pages={pages} categories={categories} onClose={() => setEditing(false)} />;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-card p-4 shadow-2xl md:p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">{task.title}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-hover" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Chip>{FREQUENCY_LABELS[task.frequency]}</Chip>
          {task.whenText && <Chip>{task.whenText}</Chip>}
          {task.category && <Chip>{task.category}</Chip>}
          <span className={`rounded px-2 py-0.5 font-medium ${TONE[DUE_LABELS[task.state].tone]}`}>{task.state === "done" ? "Done" : DUE_LABELS[task.state].label}</span>
        </div>

        <dl className="mt-5 grid grid-cols-[96px_1fr] gap-y-2 text-sm md:grid-cols-[120px_1fr]">
          <dt className="text-ink-faint">Owner</dt>
          <dd>{task.assignees.map((a) => a.name).join(", ") || task.ownerRole || <span className="text-ink-faint">Anyone</span>}</dd>
          <dt className="text-ink-faint">Next due</dt>
          <dd className="flex items-center gap-2">
            {task.nextDueOn ? fmtDate(task.nextDueOn) : "—"}
            {task.dueOverride && <span className="text-xs text-ink-faint">(moved)</span>}
            {canEdit && (
              <label className="flex cursor-pointer items-center gap-1 text-xs text-accent hover:underline">
                <CalendarClock size={12} /> change
                <input type="date" className="sr-only" onChange={(e) => e.target.value && start(async () => (await moveDueAction(slug, task.id, e.target.value), onClose()))} />
              </label>
            )}
          </dd>
          <dt className="text-ink-faint">Last done</dt>
          <dd>{task.lastDoneOn === "today" ? "Today" : task.lastDoneOn ? fmtDate(task.lastDoneOn) : <span className="text-ink-faint">Never</span>}</dd>
          {task.sopPageId && (
            <>
              <dt className="text-ink-faint">How-to</dt>
              <dd>
                <Link href={`/w/${slug}/p/${task.sopPageId}`} className="text-accent hover:underline">
                  {task.sopTitle || "Open SOP"}
                </Link>
              </dd>
            </>
          )}
        </dl>

        {task.instructions && (
          <div className="mt-5">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">Instructions</div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{task.instructions}</p>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          {task.state === "done" && task.canUndo ? (
            <button onClick={() => onUndo(task)} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm hover:bg-hover">
              <Undo2 size={14} /> Undo
            </button>
          ) : (
            <button onClick={() => onDone(task)} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-paper">
              <Check size={14} /> Mark done
            </button>
          )}
          {canEdit && (
            <button onClick={() => setEditing(true)} className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-hover">
              Edit
            </button>
          )}
          {canEdit && task.state !== "done" && (
            <button onClick={() => start(async () => (await moveDueAction(slug, task.id), onClose()))} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm hover:bg-hover" title={task.frequency === "once" ? "Push a week" : "Skip this time; due again next period"}>
              <SkipForward size={14} /> Skip
            </button>
          )}
          <button
            onClick={() => (history ? setHistory(null) : listCompletionsAction(slug, task.id).then(setHistory))}
            className="ml-auto flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-hover"
          >
            <History size={14} /> History
          </button>
        </div>

        {history && (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
            {history.length === 0 && <li className="px-3 py-3 text-ink-faint">Never completed yet.</li>}
            {history.map((h) => (
              <li key={h.id} className="flex justify-between px-3 py-2">
                <span>{fmtDate(h.doneOn)}</span>
                <span className="text-ink-faint">{h.by ?? ""}</span>
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <button
            onClick={() => confirm("Remove this task? Its history is kept.") && start(async () => (await archiveTaskAction(slug, task.id), onClose()))}
            className="mt-auto flex items-center gap-1 self-start pt-8 text-sm text-danger hover:underline"
          >
            <Trash2 size={14} /> Remove task
          </button>
        )}
      </div>
    </div>
  );
}

export const Chip = ({ children }: { children: React.ReactNode }) => <span className="rounded bg-hover px-2 py-0.5 text-ink-soft">{children}</span>;

export function TaskForm({ slug, task, members, pages, categories, preset, onClose }: { slug: string; task?: TaskRow; members: Member[]; pages: PageOpt[]; categories: readonly string[]; preset?: { frequency?: Frequency; assigneeIds?: string[] }; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [frequency, setFrequency] = useState<Frequency>(task?.frequency ?? preset?.frequency ?? "weekly");
  const [whenText, setWhenText] = useState(task?.whenText ?? "");
  const [category, setCategory] = useState(task?.category ?? "");
  const [instructions, setInstructions] = useState(task?.instructions ?? "");
  const [assignees, setAssignees] = useState<string[]>(task?.assignees.map((a) => a.id) ?? preset?.assigneeIds ?? []);
  const [ownerRole, setOwnerRole] = useState(task?.ownerRole ?? "");
  const [sopPageId, setSopPageId] = useState(task?.sopPageId ?? "");
  const [dueOn, setDueOn] = useState(task?.dueOn ?? "");
  const [busy, start] = useTransition();
  const [error, setError] = useState("");

  const submit = () =>
    start(async () => {
      try {
        const input = { title, frequency, whenText: whenText || null, category: category || null, instructions, assigneeIds: assignees, ownerRole: ownerRole || null, sopPageId: sopPageId || null, dueOn: dueOn || null };
        if (task) await updateTaskAction(slug, task.id, input);
        else await createTaskAction(slug, input);
        onClose();
      } catch (e) {
        setError((e as Error).message || "Couldn't save");
      }
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-card p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{task ? "Edit task" : "New task"}</h2>
        <div className="mt-4 space-y-3 text-sm">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-base" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-ink-faint">Repeats</span>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className="mt-1 w-full rounded-lg border border-line bg-paper px-2 py-2">
                {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-ink-faint">{frequency === "once" ? "Due date" : "First due (optional)"}</span>
              <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper px-2 py-2" />
            </label>
          </div>
          {frequency !== "once" && <input value={whenText} onChange={(e) => setWhenText(e.target.value)} placeholder='When, in words (e.g. "First Monday of the month")' className="w-full rounded-lg border border-line bg-paper px-3 py-2" />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-ink-faint">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper px-2 py-2">
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-ink-faint">How-to page</span>
              <select value={sopPageId} onChange={(e) => setSopPageId(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper px-2 py-2">
                <option value="">None</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon ?? "📄"} {p.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <span className="text-xs text-ink-faint">Who does it</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {members.map((m) => {
                const on = assignees.includes(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => setAssignees(on ? assignees.filter((x) => x !== m.id) : [...assignees, m.id])} className={`rounded-full border px-3 py-1 ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-hover"}`}>
                    {m.name}
                  </button>
                );
              })}
            </div>
            <input value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)} placeholder='Or a role, e.g. "Office Manager" (leave blank for anyone)' className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2" />
          </div>
          <label className="block">
            <span className="text-xs text-ink-faint">Instructions</span>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2" />
          </label>
          {error && <p className="text-danger">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-hover">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !title.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
