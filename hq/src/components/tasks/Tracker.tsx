"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Plus, MoreHorizontal, Users, ChevronRight, SkipForward, Trash2, Pencil, UserPlus } from "lucide-react";
import { archiveTaskAction, completeTaskAction, createTaskAction, moveDueAction, undoTaskAction, updateTaskAction } from "@/app/actions";
import type { TaskRow } from "@/lib/services/tasks";
import type { Frequency } from "@/db/schema";
import { DUE_LABELS, FREQUENCY_LABELS, PERIOD_LABELS, doneThisPeriod, fmtDate, todayISO } from "@/lib/recurrence";
import { TaskDrawer, TaskForm, TONE, type Member, type PageOpt } from "./TaskDialogs";

const TABS: { key: Frequency; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annual" },
  { key: "once", label: "One-off" },
];

type Group = { key: string; name: string; memberId: string | null; tasks: TaskRow[] };

/**
 * The recurring-work tracker: one tab per cadence, tasks grouped by who owns them,
 * tick to complete, quick-add per person, and a menu to edit / reassign / skip / remove.
 * Used on the dashboard (compact) and as the Tasks page (full).
 */
export function Tracker({ slug, tasks, members, pages, categories, me, canEdit, mode }: { slug: string; tasks: TaskRow[]; members: Member[]; pages: PageOpt[]; categories: readonly string[]; me: string; canEdit: boolean; mode: "dashboard" | "full" }) {
  const [tab, setTab] = useState<Frequency>(() => firstTabNeedingAttention(tasks));
  const [groupBy, setGroupBy] = useState<"person" | "list">("person");
  const [onlyMine, setOnlyMine] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [open, setOpen] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState<{ memberId: string | null; frequency: Frequency } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [reassign, setReassign] = useState<TaskRow | null>(null);
  const [local, setLocal] = useState<Record<string, Partial<TaskRow>>>({});
  const [, start] = useTransition();
  const today = todayISO();

  const rows = useMemo(() => tasks.map((t) => ({ ...t, ...local[t.id] })), [tasks, local]);
  const inTab = rows.filter((t) => t.frequency === tab && (!onlyMine || t.assignees.some((a) => a.id === me) || t.assignees.length === 0));
  const isDone = (t: TaskRow) => doneThisPeriod(t.frequency, t.lastDoneOn, today) && t.state !== "overdue";

  // Counts per tab for the badges.
  const tabCounts = Object.fromEntries(TABS.map((x) => [x.key, rows.filter((t) => t.frequency === x.key && (t.state === "overdue" || t.state === "today")).length])) as Record<Frequency, number>;

  const groups: Group[] = useMemo(() => {
    if (groupBy === "list") return [{ key: "all", name: "", memberId: null, tasks: inTab }];
    const out: Group[] = members.map((m) => ({ key: m.id, name: m.name, memberId: m.id, tasks: inTab.filter((t) => t.assignees.some((a) => a.id === m.id)) }));
    const roles = new Map<string, TaskRow[]>();
    for (const t of inTab) if (!t.assignees.length && t.ownerRole) roles.set(t.ownerRole, [...(roles.get(t.ownerRole) ?? []), t]);
    for (const [role, ts] of roles) out.push({ key: `role:${role}`, name: role, memberId: null, tasks: ts });
    const unassigned = inTab.filter((t) => !t.assignees.length && !t.ownerRole);
    if (unassigned.length || canEdit) out.push({ key: "none", name: "Anyone", memberId: null, tasks: unassigned });
    return out.filter((g) => g.tasks.length || (mode === "full" && g.memberId));
  }, [groupBy, inTab, members, canEdit, mode]);

  const visible = (ts: TaskRow[]) => (hideDone ? ts.filter((t) => !isDone(t)) : ts).sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || rank(a) - rank(b) || a.title.localeCompare(b.title));

  const toggle = (t: TaskRow) => {
    if (isDone(t)) {
      if (!t.canUndo) return;
      setLocal((l) => ({ ...l, [t.id]: { lastDoneOn: null, state: "today", canUndo: false } }));
      start(() => undoTaskAction(slug, t.id));
    } else {
      setLocal((l) => ({ ...l, [t.id]: { lastDoneOn: today, state: t.frequency === "once" ? "done" : "later", canUndo: true } }));
      start(() => completeTaskAction(slug, t.id));
    }
  };

  const doneCount = inTab.filter(isDone).length;
  const period = PERIOD_LABELS[tab];

  return (
    <div className={mode === "full" ? "mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8" : ""}>
      {mode === "full" && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Tracker</h1>
            <p className="mt-1 text-sm text-ink-soft">Daily, weekly, monthly, quarterly and annual work, by person. Tick it off as it gets done.</p>
          </div>
          {canEdit && (
            <button onClick={() => setCreating({ memberId: null, frequency: tab })} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-paper">
              <Plus size={16} /> New task
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${mode === "full" ? "mt-5 border-b border-line pb-2" : ""}`}>
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-1 overflow-x-auto scrollbar-thin">
          {TABS.map((x) => (
            <button key={x.key} onClick={() => setTab(x.key)} className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm md:py-1.5 ${tab === x.key ? "bg-hover font-medium text-ink" : "text-ink-soft hover:bg-hover"}`}>
              {x.label}
              {tabCounts[x.key] > 0 && <span className="rounded-full bg-danger-soft px-1.5 text-[10px] font-semibold text-danger">{tabCounts[x.key]}</span>}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs">
          <button onClick={() => setGroupBy(groupBy === "person" ? "list" : "person")} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-ink-soft hover:bg-hover" title="Group by person or show one list">
            <Users size={13} /> {groupBy === "person" ? "By person" : "One list"}
          </button>
          <button onClick={() => setOnlyMine((v) => !v)} className={`rounded-md px-2 py-1.5 ${onlyMine ? "bg-accent-soft text-accent" : "text-ink-soft hover:bg-hover"}`}>
            Mine
          </button>
          <button onClick={() => setHideDone((v) => !v)} className={`rounded-md px-2 py-1.5 ${hideDone ? "bg-accent-soft text-accent" : "text-ink-soft hover:bg-hover"}`}>
            Hide done
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-3 flex items-center gap-3 text-xs text-ink-soft">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
          <div className="h-full rounded-full bg-ok transition-all" style={{ width: inTab.length ? `${Math.round((doneCount / inTab.length) * 100)}%` : "0%" }} />
        </div>
        <span className="shrink-0">
          {doneCount} of {inTab.length} done {period}
        </span>
      </div>

      {/* Groups */}
      {inTab.length === 0 && !canEdit && <p className="mt-6 text-sm text-ink-faint">No {FREQUENCY_LABELS[tab].toLowerCase()} tasks yet.</p>}
      <div className={`mt-3 grid gap-3 ${groupBy === "person" && mode === "full" ? "md:grid-cols-2 xl:grid-cols-3" : groupBy === "person" ? "md:grid-cols-2 lg:grid-cols-3" : ""}`}>
        {groups.map((g) => {
          const ts = visible(g.tasks);
          const gDone = g.tasks.filter(isDone).length;
          return (
            <section key={g.key} className={`min-w-0 ${groupBy === "person" ? "rounded-xl border border-line bg-side/60 p-3" : ""}`}>
              {groupBy === "person" && (
                <header className="mb-1.5 flex items-center gap-2">
                  <Avatar name={g.name} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.name}</span>
                  <span className="text-xs text-ink-faint">
                    {gDone}/{g.tasks.length}
                  </span>
                </header>
              )}
              <ul className="space-y-0.5">
                {ts.map((t) => {
                  const done = isDone(t);
                  return (
                    <li key={t.id} className="group relative flex min-h-10 min-w-0 items-center gap-2 rounded-md px-1 py-1 hover:bg-hover">
                      <button
                        onClick={() => toggle(t)}
                        disabled={done && !t.canUndo}
                        title={done ? "Undo" : "Mark done"}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${done ? "border-ok bg-ok-soft text-ok" : "border-ink-faint text-transparent hover:border-accent hover:text-accent"}`}
                      >
                        <Check size={14} />
                      </button>
                      <button onClick={() => setOpen(t)} className="min-w-0 flex-1 text-left">
                        <div className={`truncate text-sm ${done ? "text-ink-faint line-through decoration-ink-faint/50" : ""}`}>{t.title}</div>
                        <div className="truncate text-[11px] text-ink-faint">
                          {t.whenText || (t.nextDueOn && !done ? fmtDate(t.nextDueOn) : "")}
                          {groupBy === "list" && (t.assignees.length || t.ownerRole) ? ` · ${t.assignees.map((a) => a.name.split(" ")[0]).join(", ") || t.ownerRole}` : ""}
                          {t.assignees.length > 1 && groupBy === "person" ? ` · with ${t.assignees.filter((a) => a.id !== g.memberId).map((a) => a.name.split(" ")[0]).join(", ")}` : ""}
                        </div>
                      </button>
                      {!done && (t.state === "overdue" || t.state === "today") && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TONE[DUE_LABELS[t.state].tone]}`}>{DUE_LABELS[t.state].label}</span>}
                      {canEdit ? (
                        <button onClick={() => setMenu(menu === t.id ? null : t.id)} className="shrink-0 rounded p-1 text-ink-faint hover:bg-line hover:text-ink md:opacity-0 md:group-hover:opacity-100" aria-label="More">
                          <MoreHorizontal size={15} />
                        </button>
                      ) : (
                        <ChevronRight size={14} className="shrink-0 text-ink-faint" />
                      )}
                      {menu === t.id && (
                        <div className="absolute right-1 top-9 z-30 w-48 rounded-lg border border-line bg-card p-1 text-sm shadow-lg" onMouseLeave={() => setMenu(null)}>
                          <MenuItem icon={<Pencil size={13} />} onClick={() => (setMenu(null), setOpen(t))}>
                            Open / edit
                          </MenuItem>
                          <MenuItem icon={<UserPlus size={13} />} onClick={() => (setMenu(null), setReassign(t))}>
                            Reassign
                          </MenuItem>
                          {!done && (
                            <MenuItem icon={<SkipForward size={13} />} onClick={() => (setMenu(null), start(async () => void (await moveDueAction(slug, t.id))))}>
                              Skip this time
                            </MenuItem>
                          )}
                          <MenuItem icon={<Trash2 size={13} />} danger onClick={() => (setMenu(null), confirm(`Remove "${t.title}"? Its history is kept.`) && start(() => archiveTaskAction(slug, t.id)))}>
                            Remove
                          </MenuItem>
                        </div>
                      )}
                    </li>
                  );
                })}
                {ts.length === 0 && g.tasks.length > 0 && <li className="px-2 py-1 text-xs text-ink-faint">All done {period}. 🎉</li>}
              </ul>
              {canEdit && <QuickAdd slug={slug} frequency={tab} memberId={g.memberId} onMore={() => setCreating({ memberId: g.memberId, frequency: tab })} />}
            </section>
          );
        })}
      </div>

      {open && <TaskDrawer slug={slug} task={rows.find((t) => t.id === open.id) ?? open} members={members} pages={pages} categories={categories} canEdit={canEdit} onClose={() => setOpen(null)} onDone={(t) => (toggle(t), setOpen(null))} onUndo={(t) => (toggle(t), setOpen(null))} />}
      {creating && <TaskForm slug={slug} members={members} pages={pages} categories={categories} preset={{ frequency: creating.frequency, assigneeIds: creating.memberId ? [creating.memberId] : [] }} onClose={() => setCreating(null)} />}
      {reassign && (
        <ReassignDialog
          task={reassign}
          members={members}
          onClose={() => setReassign(null)}
          onSave={(ids, role) => {
            setLocal((l) => ({ ...l, [reassign.id]: { assignees: members.filter((m) => ids.includes(m.id)), ownerRole: role } }));
            setReassign(null);
            start(() => updateTaskAction(slug, reassign.id, { assigneeIds: ids, ownerRole: role }));
          }}
        />
      )}
    </div>
  );
}

const rank = (t: TaskRow) => ({ overdue: 0, today: 1, soon: 2, later: 3, done: 4 })[t.state];

function firstTabNeedingAttention(tasks: TaskRow[]): Frequency {
  for (const x of TABS) if (tasks.some((t) => t.frequency === x.key && (t.state === "overdue" || t.state === "today"))) return x.key;
  return "daily";
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-paper" style={{ background: `hsl(${h} 55% 60%)` }}>
      {initials || "?"}
    </span>
  );
}

function MenuItem({ icon, danger, onClick, children }: { icon: React.ReactNode; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${danger ? "text-danger hover:bg-danger-soft" : "hover:bg-hover"}`}>
      {icon} {children}
    </button>
  );
}

function QuickAdd({ slug, frequency, memberId, onMore }: { slug: string; frequency: Frequency; memberId: string | null; onMore: () => void }) {
  const [v, setV] = useState("");
  const [busy, start] = useTransition();
  return (
    <form
      className="mt-1 flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const title = v.trim();
        if (!title) return;
        setV("");
        start(async () => void (await createTaskAction(slug, { title, frequency, assigneeIds: memberId ? [memberId] : [] })));
      }}
    >
      <Plus size={14} className="shrink-0 text-ink-faint" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={`Add a ${FREQUENCY_LABELS[frequency].toLowerCase()} task…`} className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-ink-faint" disabled={busy} />
      <button type="button" onClick={onMore} className="shrink-0 rounded px-1.5 py-1 text-[11px] text-ink-faint hover:bg-hover hover:text-ink" title="More options">
        details
      </button>
    </form>
  );
}

function ReassignDialog({ task, members, onClose, onSave }: { task: TaskRow; members: Member[]; onClose: () => void; onSave: (ids: string[], role: string | null) => void }) {
  const [ids, setIds] = useState<string[]>(task.assignees.map((a) => a.id));
  const [role, setRole] = useState(task.ownerRole ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-xl border border-line bg-card p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Who does this?</h3>
        <p className="mt-0.5 truncate text-sm text-ink-soft">{task.title}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {members.map((m) => {
            const on = ids.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => setIds(on ? ids.filter((x) => x !== m.id) : [...ids, m.id])} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-hover"}`}>
                {m.name}
              </button>
            );
          })}
        </div>
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder='Or a role, e.g. "Office Manager"' className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-hover">
            Cancel
          </button>
          <button onClick={() => onSave(ids, role.trim() || null)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
