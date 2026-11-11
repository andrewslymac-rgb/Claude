"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Check, Undo2, X, Trash2, History, CalendarClock, SkipForward, MessageSquare, Bell, BellOff } from "lucide-react";
import { addTaskNoteAction, archiveTaskAction, completeTaskAction, createTaskAction, deleteTaskNoteAction, listCompletionsAction, listTaskNotesAction, moveDueAction, setFollowUpAction, updateTaskAction } from "@/app/actions";
import { todayISO } from "@/lib/recurrence";
import type { TaskRow } from "@/lib/services/tasks";
import type { Frequency } from "@/db/schema";
import { DUE_LABELS, FREQUENCY_LABELS, fmtDate } from "@/lib/recurrence";

export type Member = { id: string; name: string };
export type JobRole = { id: string; name: string; emoji: string; color: string };
export type PageOpt = { id: string; title: string; icon: string | null };

export const TONE: Record<string, string> = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  accent: "bg-accent-soft text-accent",
  muted: "bg-hover text-ink-soft",
  ok: "bg-ok-soft text-ok",
};

export function TaskDrawer({ slug, task, members, roles = [], pages, categories, canEdit, onClose, onDone, onUndo }: { slug: string; task: TaskRow; members: Member[]; roles?: JobRole[]; pages: PageOpt[]; categories: readonly string[]; canEdit: boolean; onClose: () => void; onDone: (t: TaskRow) => void; onUndo: (t: TaskRow) => void }) {
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof listCompletionsAction>> | null>(null);
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof listTaskNotesAction>> | null>(null);
  const [noteText, setNoteText] = useState("");
  const [doneOn, setDoneOn] = useState<{ date: string; note: string } | null>(null);
  const [followUp, setFollowUp] = useState<{ date: string; note: string } | null>(null);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [lastTo, setLastTo] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => {
    listTaskNotesAction(slug, task.id).then(setNotes);
  }, [slug, task.id]);
  const refreshNotes = () => listTaskNotesAction(slug, task.id).then(setNotes);
  const today = todayISO();
  if (editing) return <TaskForm slug={slug} task={task} members={members} roles={roles} pages={pages} categories={categories} onClose={() => setEditing(false)} />;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onMouseDown={onClose}>
      <div className="pt-safe pb-safe flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-card p-4 shadow-2xl md:p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 flex items-start justify-between gap-3 bg-card px-4 pb-2 pt-4 md:static md:m-0 md:p-0">
          <h2 className="text-xl font-semibold">{task.title}</h2>
          <button onClick={onClose} className="tap-icon rounded p-1 hover:bg-hover" aria-label="Close">
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
          <dd>
            {task.assignees.map((a) => a.name).join(", ")}
            {task.role && (
              <span className="ml-1 rounded-full px-2 py-0.5 text-xs" style={{ background: `${task.role.color}33`, color: task.role.color }}>
                {task.role.emoji} {task.role.name}
              </span>
            )}
            {!task.assignees.length && !task.role && (task.ownerRole || <span className="text-ink-faint">Anyone</span>)}
          </dd>
          <dt className="text-ink-faint">Next due</dt>
          <dd className="flex items-center gap-2">
            {task.nextDueOn ? fmtDate(task.nextDueOn) : "—"}
            {task.dueOverride && <span className="text-xs text-ink-faint">(moved)</span>}
            {canEdit && !moveTo && (
              <button type="button" onClick={() => setMoveTo(task.nextDueOn ?? today)} className="flex items-center gap-1 text-xs text-accent hover:underline">
                <CalendarClock size={12} /> change
              </button>
            )}
          </dd>
          <dt className="text-ink-faint">Last done</dt>
          <dd className="flex items-center gap-2">
            {task.lastDoneOn === "today" ? "Today" : task.lastDoneOn ? fmtDate(task.lastDoneOn) : <span className="text-ink-faint">Never</span>}
            {canEdit && lastTo === null && (
              <button type="button" onClick={() => setLastTo(task.lastDoneOn && task.lastDoneOn !== "today" ? task.lastDoneOn : today)} className="flex items-center gap-1 text-xs text-accent hover:underline">
                <CalendarClock size={12} /> change
              </button>
            )}
          </dd>
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
            <button onClick={() => onUndo(task)} className="flex items-center gap-1 btn btn-secondary">
              <Undo2 size={14} /> Undo
            </button>
          ) : (
            <button onClick={() => onDone(task)} className="flex items-center gap-1 btn btn-primary">
              <Check size={14} /> Mark done
            </button>
          )}
          {canEdit && (
            <button onClick={() => setEditing(true)} className="btn btn-secondary">
              Edit
            </button>
          )}
          {canEdit && task.state !== "done" && (
            <button onClick={() => start(async () => (await moveDueAction(slug, task.id), onClose()))} className="flex items-center gap-1 btn btn-secondary" title={task.frequency === "once" ? "Push a week" : "Skip this time; due again next period"}>
              <SkipForward size={14} /> Skip
            </button>
          )}
          <button
            onClick={() => (history ? setHistory(null) : listCompletionsAction(slug, task.id).then(setHistory))}
            className="ml-auto flex items-center gap-1 btn btn-ghost"
          >
            <History size={14} /> History
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <button onClick={() => setDoneOn(doneOn ? null : { date: today, note: "" })} className="flex items-center gap-1 text-accent hover:underline">
            <CalendarClock size={12} /> {doneOn ? "Cancel" : "Mark done on a different day, or with a note"}
          </button>
          <button onClick={() => setFollowUp(followUp ? null : { date: task.followUpOn ?? "", note: task.followUpNote ?? "" })} className="flex items-center gap-1 text-accent hover:underline">
            <Bell size={12} /> {task.followUpOn ? "Change follow-up" : "Set a follow-up"}
          </button>
        </div>

        {moveTo && (
          <form
            className="mt-4 space-y-2 rounded-lg border border-line bg-side/40 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const to = moveTo;
              start(async () => {
                await moveDueAction(slug, task.id, to);
                setMoveTo(null);
              });
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-ink-faint">
                Move next due to
                <input type="date" required value={moveTo} min={today} onChange={(e) => setMoveTo(e.target.value)} className="ml-2 field w-auto py-1.5" />
              </label>
            </div>
            <p className="text-[11px] text-ink-faint">Nothing is marked done. The task is just due on the new date; the schedule picks up again from there.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMoveTo(null)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
              <button disabled={busy} className="btn btn-primary btn-sm">
                {busy ? "Saving…" : "Move due date"}
              </button>
            </div>
          </form>
        )}

        {lastTo !== null && (
          <form
            className="mt-4 space-y-2 rounded-lg border border-line bg-side/40 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const to = lastTo;
              start(async () => {
                await updateTaskAction(slug, task.id, { lastDoneOn: to || null });
                setLastTo(null);
                setHistory(await listCompletionsAction(slug, task.id));
              });
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-ink-faint">
                Last done on
                <input type="date" required value={lastTo} max={today} onChange={(e) => setLastTo(e.target.value)} className="ml-2 field w-auto py-1.5" />
              </label>
            </div>
            <p className="text-[11px] text-ink-faint">Moves the most recent completion to this date; the next due date follows the schedule from there.</p>
            <div className="flex flex-wrap justify-end gap-2">
              {task.lastDoneOn && (
                <button type="button" disabled={busy} onClick={() => start(async () => (await updateTaskAction(slug, task.id, { lastDoneOn: null }), setLastTo(null), setHistory(await listCompletionsAction(slug, task.id))))} className="btn btn-ghost btn-sm text-danger">
                  Never done
                </button>
              )}
              <button type="button" onClick={() => setLastTo(null)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
              <button disabled={busy} className="btn btn-primary btn-sm">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}

        {doneOn && (
          <form
            className="mt-3 space-y-2 rounded-lg border border-line bg-side/60 p-3 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                await completeTaskAction(slug, task.id, doneOn.date, doneOn.note);
                setDoneOn(null);
                setHistory(await listCompletionsAction(slug, task.id));
              });
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-ink-faint">
                Done on
                <input type="date" required max={today} value={doneOn.date} onChange={(e) => setDoneOn({ ...doneOn, date: e.target.value })} className="ml-2 field w-auto py-1.5" />
              </label>
            </div>
            <textarea value={doneOn.note} onChange={(e) => setDoneOn({ ...doneOn, note: e.target.value })} rows={2} placeholder="What happened? (optional) e.g. 'Reconciled through Oct 31; two checks still outstanding.'" className="field" />
            <div className="flex justify-end">
              <button disabled={busy} className="btn btn-primary btn-sm">
                {busy ? "Saving…" : "Save completion"}
              </button>
            </div>
          </form>
        )}

        {(followUp || task.followUpOn) && (
          <div className="mt-3 rounded-lg border border-line bg-side/60 p-3 text-sm">
            {followUp ? (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  start(async () => {
                    await setFollowUpAction(slug, task.id, followUp.date || null, followUp.note);
                    setFollowUp(null);
                  });
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-ink-faint">
                    Follow up on
                    <input type="date" required value={followUp.date} onChange={(e) => setFollowUp({ ...followUp, date: e.target.value })} className="ml-2 field w-auto py-1.5" />
                  </label>
                </div>
                <input value={followUp.note} onChange={(e) => setFollowUp({ ...followUp, note: e.target.value })} placeholder="What to check on (optional)" className="field" />
                <div className="flex justify-end gap-2">
                  {task.followUpOn && (
                    <button type="button" disabled={busy} onClick={() => start(async () => (await setFollowUpAction(slug, task.id, null), setFollowUp(null)))} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-ink-soft hover:bg-hover">
                      <BellOff size={12} /> Clear
                    </button>
                  )}
                  <button disabled={busy || !followUp.date} className="btn btn-primary btn-sm">
                    Save follow-up
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-start gap-2">
                <Bell size={15} className={`mt-0.5 shrink-0 ${task.followUpOn! <= today ? "text-warn" : "text-accent"}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    Follow up {fmtDate(task.followUpOn!)}
                    {task.followUpOn! < today ? <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-[11px] text-warn">past</span> : task.followUpOn === today ? <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-[11px] text-warn">today</span> : null}
                  </div>
                  {task.followUpNote && <div className="text-ink-soft">{task.followUpNote}</div>}
                </div>
                <button disabled={busy} onClick={() => start(async () => void (await setFollowUpAction(slug, task.id, null)))} className="tap-icon rounded p-1 text-ink-faint hover:bg-hover hover:text-ink" title="Done following up">
                  <Check size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {history && (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
            {history.length === 0 && <li className="px-3 py-3 text-ink-faint">Never completed yet.</li>}
            {history.map((h) => (
              <li key={h.id} className="px-3 py-2">
                <div className="flex justify-between">
                  <span>{fmtDate(h.doneOn)}</span>
                  <span className="text-ink-faint">{h.by ?? ""}</span>
                </div>
                {h.note && <div className="mt-0.5 text-xs text-ink-soft">{h.note}</div>}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6">
          <div className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
            <MessageSquare size={12} /> Notes {notes && notes.length > 0 && <span className="rounded-full bg-hover px-1.5 text-[10px] normal-case">{notes.length}</span>}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const body = noteText.trim();
              if (!body) return;
              setNoteText("");
              start(async () => {
                await addTaskNoteAction(slug, task.id, body);
                await refreshNotes();
              });
            }}
          >
            <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note… (what happened, what to remember, a handoff)" className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <button disabled={busy || !noteText.trim()} className="btn btn-primary">
              Add
            </button>
          </form>
          <ul className="mt-2 space-y-2">
            {notes?.map((n) => (
              <li key={n.id} className="group rounded-lg border border-line bg-side/60 px-3 py-2 text-sm">
                <div className="whitespace-pre-wrap">{n.body}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-faint">
                  <span>{n.by ?? "Someone"}</span>
                  <span>·</span>
                  <span>{new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}</span>
                  {canEdit && (
                    <button onClick={() => confirm("Delete this note?") && start(async () => (await deleteTaskNoteAction(slug, task.id, n.id), await refreshNotes()))} className="ml-auto rounded px-1 text-ink-faint hover:text-danger md:opacity-0 md:group-hover:opacity-100">
                      delete
                    </button>
                  )}
                </div>
              </li>
            ))}
            {notes && notes.length === 0 && <li className="text-xs text-ink-faint">No notes yet.</li>}
          </ul>
        </div>

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

export function TaskForm({ slug, task, members, roles = [], pages, categories, preset, onClose, onCreated }: { slug: string; task?: TaskRow; members: Member[]; roles?: JobRole[]; pages: PageOpt[]; categories: readonly string[]; preset?: { frequency?: Frequency; assigneeIds?: string[]; roleId?: string | null }; onClose: () => void; onCreated?: (title: string) => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [frequency, setFrequency] = useState<Frequency>(task?.frequency ?? preset?.frequency ?? "weekly");
  const [whenText, setWhenText] = useState(task?.whenText ?? "");
  const [category, setCategory] = useState(task?.category ?? "");
  const [instructions, setInstructions] = useState(task?.instructions ?? "");
  const [assignees, setAssignees] = useState<string[]>(task?.assignees.map((a) => a.id) ?? preset?.assigneeIds ?? []);
  const [roleId, setRoleId] = useState<string | null>(task?.roleId ?? preset?.roleId ?? null);
  const [sopPageId, setSopPageId] = useState(task?.sopPageId ?? "");
  const [dueOn, setDueOn] = useState(task?.dueOn ?? "");
  const [nextDue, setNextDue] = useState(task?.nextDueOn ?? "");
  const [lastDone, setLastDone] = useState(task?.lastDoneOn && task.lastDoneOn !== "today" ? task.lastDoneOn : "");
  const [busy, start] = useTransition();
  const [error, setError] = useState("");

  const submit = () =>
    start(async () => {
      try {
        const input = { title, frequency, whenText: whenText || null, category: category || null, instructions, assigneeIds: assignees, roleId, sopPageId: sopPageId || null, dueOn: dueOn || null };
        if (task) {
          const origLast = task.lastDoneOn && task.lastDoneOn !== "today" ? task.lastDoneOn : "";
          await updateTaskAction(slug, task.id, {
            ...input,
            ...(lastDone !== origLast ? { lastDoneOn: lastDone || null } : {}),
            ...(nextDue && nextDue !== (task.nextDueOn ?? "") ? { nextDueOn: nextDue } : {}),
          });
        }
        else {
          await createTaskAction(slug, input);
          onCreated?.(title);
        }
        onClose();
      } catch (e) {
        setError((e as Error).message || "Couldn't save");
      }
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div className="pb-safe max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-card p-6 shadow-2xl sm:rounded-xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{task ? "Edit task" : "New task"}</h2>
        <div className="mt-4 space-y-3 text-sm">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" className="field" />
          <div>
            <span className="text-xs text-ink-faint">How often</span>
            <div className="mt-1 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                <button key={f} type="button" onClick={() => setFrequency(f)} className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${frequency === f ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-hover"}`}>
                  {FREQUENCY_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs text-ink-faint">{frequency === "once" ? "Due date" : "First due (optional)"}</span>
            <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className="field mt-1" />
          </label>
          {task && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-side/40 p-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-ink-faint">Next due</span>
                <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} className="field mt-1" />
              </label>
              <label className="block">
                <span className="text-xs text-ink-faint">Last done</span>
                <div className="mt-1 flex gap-1.5">
                  <input type="date" value={lastDone} max={new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })} onChange={(e) => setLastDone(e.target.value)} className="field" />
                  {lastDone && (
                    <button type="button" onClick={() => setLastDone("")} className="btn btn-ghost btn-sm" title="Never done">
                      clear
                    </button>
                  )}
                </div>
              </label>
              <p className="text-[11px] text-ink-faint sm:col-span-2">Changing Last done moves the most recent completion to that date, and Next due follows the schedule from there. Set Next due yourself to override it.</p>
            </div>
          )}
          {frequency !== "once" && <input value={whenText} onChange={(e) => setWhenText(e.target.value)} placeholder='When, in words (e.g. "First Monday of the month")' className="field" />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-ink-faint">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="field mt-1">
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-ink-faint">How-to page</span>
              <select value={sopPageId} onChange={(e) => setSopPageId(e.target.value)} className="field mt-1">
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
                  <button key={m.id} type="button" onClick={() => setAssignees(on ? assignees.filter((x) => x !== m.id) : [...assignees, m.id])} className={`tap rounded-full border px-3 py-1 ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-hover"}`}>
                    {on && "✓ "}{m.name}
                  </button>
                );
              })}
            </div>
            {roles.length > 0 && (
              <>
                <span className="mt-2 block text-xs text-ink-faint">Or a job role (everyone in it sees the task)</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {roles.map((r) => {
                    const on = roleId === r.id;
                    return (
                      <button key={r.id} type="button" onClick={() => setRoleId(on ? null : r.id)} className={`tap rounded-full border px-3 py-1 ${on ? "border-accent bg-accent-soft font-medium text-ink" : "border-line text-ink-soft hover:bg-hover"}`} style={on ? { borderColor: r.color, background: `${r.color}44` } : undefined}>
                        {on ? "✓" : r.emoji} {r.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {!assignees.length && !roleId && <p className="mt-1 text-xs text-ink-faint">Nobody picked: anyone can do it.</p>}
          </div>
          <label className="block">
            <span className="text-xs text-ink-faint">Instructions</span>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} className="mt-1 field" />
          </label>
          {error && <p className="text-danger">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !title.trim()} className="btn btn-primary">
            {busy ? "Saving…" : task ? "Save" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}
