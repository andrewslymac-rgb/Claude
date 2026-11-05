"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Check, Undo2, Plus, ChevronRight, X, Trash2, History, Users } from "lucide-react";
import { archiveTaskAction, completeTaskAction, createTaskAction, listCompletionsAction, undoTaskAction, updateTaskAction } from "@/app/actions";
import type { TaskRow } from "@/lib/services/tasks";
import type { Frequency } from "@/db/schema";
import { DUE_LABELS, FREQUENCY_LABELS, fmtDate } from "@/lib/recurrence";

type Member = { id: string; name: string };
type PageOpt = { id: string; title: string; icon: string | null };
type View = "attention" | "mine" | "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "once" | "all";

const VIEWS: { key: View; label: string }[] = [
  { key: "attention", label: "Needs attention" },
  { key: "mine", label: "My tasks" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annual" },
  { key: "once", label: "One-off" },
  { key: "all", label: "All" },
];

const TONE: Record<string, string> = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  accent: "bg-accent-soft text-accent",
  muted: "bg-hover text-ink-soft",
  ok: "bg-ok-soft text-ok",
};

export function TasksView({ slug, tasks, members, pages, categories, me, canEdit }: { slug: string; tasks: TaskRow[]; members: Member[]; pages: PageOpt[]; categories: readonly string[]; me: string; canEdit: boolean }) {
  const [view, setView] = useState<View>("attention");
  const [category, setCategory] = useState<string>("");
  const [open, setOpen] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [, start] = useTransition();
  // Optimistic state so Done feels instant.
  const [local, setLocal] = useState<Record<string, Partial<TaskRow>>>({});
  const rows = useMemo(() => tasks.map((t) => ({ ...t, ...local[t.id] })), [tasks, local]);

  const filtered = rows.filter((t) => {
    if (category && t.category !== category) return false;
    switch (view) {
      case "attention":
        return t.state === "overdue" || t.state === "today" || (t.assignees.length === 0 && !t.ownerRole);
      case "mine":
        return t.assignees.some((a) => a.id === me);
      case "all":
        return true;
      default:
        return t.frequency === view;
    }
  });

  const markDone = (t: TaskRow) => {
    setLocal((l) => ({ ...l, [t.id]: { state: "done", lastDoneOn: "today", canUndo: true } }));
    start(() => completeTaskAction(slug, t.id));
  };
  const undo = (t: TaskRow) => {
    setLocal((l) => ({ ...l, [t.id]: { state: "today", canUndo: false } }));
    start(() => undoTaskAction(slug, t.id));
  };

  const counts = { overdue: rows.filter((t) => t.state === "overdue").length, today: rows.filter((t) => t.state === "today").length };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {counts.overdue > 0 && <span className="text-danger">{counts.overdue} overdue</span>}
            {counts.overdue > 0 && counts.today > 0 && " · "}
            {counts.today > 0 && <span className="text-warn">{counts.today} due today</span>}
            {counts.overdue === 0 && counts.today === 0 && "Nothing overdue. Nice."}
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-paper">
            <Plus size={16} /> New task
          </button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-1 border-b border-line pb-2">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} className={`rounded-md px-3 py-1.5 text-sm ${view === v.key ? "bg-hover font-medium text-ink" : "text-ink-soft hover:bg-hover"}`}>
            {v.label}
          </button>
        ))}
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="ml-auto rounded-md border border-line bg-card px-2 py-1.5 text-sm">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-ink-faint">{view === "attention" ? "Nothing needs attention right now." : "No tasks here yet."}</div>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {filtered.map((t) => (
            <li key={t.id} className="group flex items-center gap-3 py-2.5">
              <button
                onClick={() => (t.state === "done" && t.canUndo ? undo(t) : markDone(t))}
                title={t.state === "done" ? "Undo" : "Mark done"}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${t.state === "done" ? "border-ok bg-ok-soft text-ok" : "border-ink-faint text-transparent hover:border-accent hover:text-accent"}`}
              >
                {t.state === "done" ? <Check size={14} /> : <Check size={14} />}
              </button>
              <button onClick={() => setOpen(t)} className="min-w-0 flex-1 text-left">
                <div className={`truncate ${t.state === "done" ? "text-ink-soft" : ""}`}>{t.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
                  <span>{FREQUENCY_LABELS[t.frequency]}</span>
                  {t.whenText && <span>· {t.whenText}</span>}
                  {t.category && <span>· {t.category}</span>}
                  {(t.assignees.length > 0 || t.ownerRole) && (
                    <span className="flex items-center gap-1">
                      · <Users size={11} /> {t.assignees.map((a) => a.name.split(" ")[0]).join(", ") || t.ownerRole}
                    </span>
                  )}
                </div>
              </button>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${TONE[DUE_LABELS[t.state].tone]}`}>
                {t.state === "done" ? `Done${t.lastDoneOn === "today" ? " today" : t.lastDoneOn ? " " + fmtDate(t.lastDoneOn) : ""}` : t.state === "later" ? fmtDate(t.nextDueOn) : DUE_LABELS[t.state].label}
              </span>
              {t.state === "done" && t.canUndo && (
                <button onClick={() => undo(t)} className="rounded p-1 text-ink-faint opacity-0 hover:bg-hover hover:text-ink group-hover:opacity-100" title="Undo">
                  <Undo2 size={14} />
                </button>
              )}
              <ChevronRight size={16} className="shrink-0 text-ink-faint" />
            </li>
          ))}
        </ul>
      )}

      {open && (
        <TaskDrawer
          slug={slug}
          task={rows.find((t) => t.id === open.id) ?? open}
          members={members}
          pages={pages}
          categories={categories}
          canEdit={canEdit}
          onClose={() => setOpen(null)}
          onDone={markDone}
          onUndo={undo}
        />
      )}
      {creating && <TaskForm slug={slug} members={members} pages={pages} categories={categories} onClose={() => setCreating(false)} />}
    </div>
  );
}

function TaskDrawer({ slug, task, members, pages, categories, canEdit, onClose, onDone, onUndo }: { slug: string; task: TaskRow; members: Member[]; pages: PageOpt[]; categories: readonly string[]; canEdit: boolean; onClose: () => void; onDone: (t: TaskRow) => void; onUndo: (t: TaskRow) => void }) {
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof listCompletionsAction>> | null>(null);
  const [, start] = useTransition();
  if (editing) return <TaskForm slug={slug} task={task} members={members} pages={pages} categories={categories} onClose={() => setEditing(false)} />;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-line bg-card p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
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

        <dl className="mt-5 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-ink-faint">Owner</dt>
          <dd>{task.assignees.map((a) => a.name).join(", ") || task.ownerRole || <span className="text-ink-faint">Anyone</span>}</dd>
          <dt className="text-ink-faint">Next due</dt>
          <dd>{task.nextDueOn ? fmtDate(task.nextDueOn) : "—"}</dd>
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

const Chip = ({ children }: { children: React.ReactNode }) => <span className="rounded bg-hover px-2 py-0.5 text-ink-soft">{children}</span>;

function TaskForm({ slug, task, members, pages, categories, onClose }: { slug: string; task?: TaskRow; members: Member[]; pages: PageOpt[]; categories: readonly string[]; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [frequency, setFrequency] = useState<Frequency>(task?.frequency ?? "weekly");
  const [whenText, setWhenText] = useState(task?.whenText ?? "");
  const [category, setCategory] = useState(task?.category ?? "");
  const [instructions, setInstructions] = useState(task?.instructions ?? "");
  const [assignees, setAssignees] = useState<string[]>(task?.assignees.map((a) => a.id) ?? []);
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
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
