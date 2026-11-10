"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, Check, ExternalLink, Mail } from "lucide-react";
import type { Frequency } from "@/db/schema";
import type { CadenceProgress, PersonTask, Source } from "@/lib/services/team";
import { completeTaskAction } from "@/app/actions";
import { DUE_LABELS } from "@/lib/recurrence";
import { TONE } from "@/components/tasks/TaskDialogs";
import { Avatar, CadenceBar, CAD_LABEL, CYCLE_WORD, Ring } from "./shared";

type Status = "open" | "overdue" | "today" | "doneCycle" | "upcoming" | "all";
const STATUSES: { key: Status; label: string }[] = [
  { key: "open", label: "Still to do" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "doneCycle", label: "Done this cycle" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "Everything" },
];
type Sort = "due" | "last" | "title";
const SOURCE_LABEL: Record<Source, string> = { direct: "Assigned", role: "Via role", anyone: "Anyone" };
const PREF = "orbit.person.prefs";

type Props = {
  slug: string;
  person: { userId: string; name: string; email: string; role: string; jobRoles: { id: string; name: string; emoji: string; color: string }[]; lastSeenAt: string | null };
  tasks: PersonTask[];
  summary: { total: number; overdue: number; dueToday: number; onTrack: number; cadences: CadenceProgress[]; doneThisWeek: number; done30: number };
  byDay: Record<string, number>;
  recent: { taskId: string; title: string; doneOn: string }[];
  today: string;
  canManage: boolean;
  isMe: boolean;
};

const fmt = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

export function PersonView({ slug, person, tasks, summary, byDay, recent, today, canManage, isMe }: Props) {
  const router = useRouter();
  const [cad, setCad] = useState<Frequency | "all">("all");
  const [status, setStatus] = useState<Status>("open");
  const [sources, setSources] = useState<Source[]>(["direct", "role"]);
  const [sort, setSort] = useState<Sort>("due");
  const [range, setRange] = useState<30 | 90>(30);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) ?? "{}");
      if (p.status) setStatus(p.status);
      if (Array.isArray(p.sources)) setSources(p.sources);
      if (p.sort) setSort(p.sort);
      if (p.range) setRange(p.range);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREF, JSON.stringify({ status, sources, sort, range }));
    } catch {}
  }, [status, sources, sort, range]);

  const shown = useMemo(() => {
    const l = tasks.filter((t) => {
      if (!sources.includes(t.source)) return false;
      if (cad !== "all" && t.frequency !== cad) return false;
      const doneNow = t.doneThisCycle || done.has(t.id);
      switch (status) {
        case "open":
          return !doneNow && t.state !== "done";
        case "overdue":
          return t.state === "overdue" && !done.has(t.id);
        case "today":
          return t.state === "today" && !done.has(t.id);
        case "doneCycle":
          return doneNow;
        case "upcoming":
          return (t.state === "soon" || t.state === "later") && !doneNow;
        default:
          return true;
      }
    });
    const by: Record<Sort, (a: PersonTask, b: PersonTask) => number> = {
      due: (a, b) => (a.nextDueOn ?? "9999").localeCompare(b.nextDueOn ?? "9999"),
      last: (a, b) => (b.lastDoneOn ?? "").localeCompare(a.lastDoneOn ?? ""),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return l.sort(by[sort]);
  }, [tasks, sources, cad, status, sort, done]);

  const counts = useMemo(() => {
    const m: Partial<Record<Frequency | "all", number>> = { all: 0 };
    for (const t of tasks) {
      if (!sources.includes(t.source)) continue;
      m.all = (m.all ?? 0) + 1;
      m[t.frequency] = (m[t.frequency] ?? 0) + 1;
    }
    return m;
  }, [tasks, sources]);

  // Completion chart: one bar per day.
  const days = Array.from({ length: range }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (range - 1 - i));
    const iso = d.toISOString().slice(0, 10);
    return { iso, n: byDay[iso] ?? 0 };
  });
  const max = Math.max(1, ...days.map((d) => d.n));
  const rangeTotal = days.reduce((s, d) => s + d.n, 0);

  const complete = (t: PersonTask) => {
    setDone((s) => new Set(s).add(t.id));
    start(async () => {
      await completeTaskAction(slug, t.id);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      {canManage && (
        <Link href={`/w/${slug}/team`} className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <ArrowLeft size={14} /> Team
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Avatar name={person.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="page-title">{isMe ? `${person.name} (you)` : person.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            {person.jobRoles.map((r) => (
              <span key={r.id} className="rounded-full border border-line px-2 py-0.5 text-xs" style={{ borderColor: r.color }}>
                {r.emoji} {r.name}
              </span>
            ))}
            <span className="capitalize text-ink-faint">{person.role}</span>
            <a href={`mailto:${person.email}`} className="inline-flex min-w-0 max-w-full items-center gap-1 truncate text-xs text-ink-faint hover:text-ink">
              <Mail size={12} /> {person.email}
            </a>
            {person.lastSeenAt && <span className="text-xs text-ink-faint">· last in Orbit {fmt(person.lastSeenAt.slice(0, 10))}</span>}
          </div>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <Ring pct={summary.onTrack} size={64} />
          <div className="text-xs text-ink-faint">
            of recurring
            <br />
            work on track
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 md:grid-cols-5 md:gap-3">
        <Tile label="Open tasks" n={summary.total} edge="border-t-accent" />
        <Tile label="Overdue" n={summary.overdue} edge="border-t-danger" tone={summary.overdue ? "text-danger" : undefined} onClick={() => (setStatus("overdue"), setCad("all"))} />
        <Tile label="Due today" n={summary.dueToday} edge="border-t-warn" tone={summary.dueToday ? "text-warn" : undefined} onClick={() => (setStatus("today"), setCad("all"))} />
        <Tile label="Done this week" n={summary.doneThisWeek} edge="border-t-ok" tone="text-ok" />
        <Tile label="Done, last 30 days" n={summary.done30} edge="border-t-ok" tone="text-ok" />
      </div>

      {/* Progress by cadence */}
      <section className="card mt-6 p-4">
        <h2 className="eyebrow mb-3">Progress by cadence</h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-6">
          {summary.cadences.map((c) => (
            <button key={c.freq} onClick={() => setCad(cad === c.freq ? "all" : c.freq)} className={`rounded-lg border p-3 text-left transition ${cad === c.freq ? "border-accent bg-accent-soft" : "border-line hover:bg-hover"}`}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">{CAD_LABEL[c.freq]}</span>
                <span className="num text-xs text-ink-faint">{c.total ? `${c.done}/${c.total}` : "none"}</span>
              </div>
              <div className="mt-2">
                <CadenceBar {...c} />
              </div>
              <div className="mt-1.5 text-[11px] text-ink-faint">
                {c.total ? `${c.done} done ${CYCLE_WORD[c.freq]}` : "Nothing assigned"}
                {c.overdue > 0 && <span className="text-danger"> · {c.overdue} overdue</span>}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Completion chart */}
      <section className="card mt-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">
            Completed tasks · {rangeTotal} in {range} days
          </h2>
          <div className="flex rounded-lg border border-line p-0.5 text-xs">
            {[30, 90].map((r) => (
              <button key={r} onClick={() => setRange(r as 30 | 90)} className={`rounded px-2 py-1 ${range === r ? "bg-hover font-medium" : "text-ink-soft"}`}>
                {r} days
              </button>
            ))}
          </div>
        </div>
        <div className="flex h-24 items-end gap-[2px]" role="img" aria-label={`${rangeTotal} tasks completed in the last ${range} days`}>
          {days.map((d) => (
            <div key={d.iso} className="group relative flex-1">
              <div className={`w-full rounded-t ${d.n ? "bg-ok" : "bg-line/60"}`} style={{ height: d.n ? `${Math.max(8, (d.n / max) * 96)}px` : "3px" }} />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-card px-2 py-1 text-[11px] shadow-lg group-hover:block">
                {fmt(d.iso)}: {d.n} done
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
          <span>{fmt(days[0].iso)}</span>
          <span>Today</span>
        </div>
      </section>

      {/* Task list */}
      <section className="mt-6">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "daily", "weekly", "monthly", "quarterly", "annual", "once"] as const).map((f) => (
            <button key={f} onClick={() => setCad(f)} className={`rounded-lg px-3 py-1.5 text-sm ${cad === f ? "bg-hover font-medium text-ink" : "text-ink-soft hover:bg-hover"}`}>
              {f === "all" ? "All" : CAD_LABEL[f]} <span className="num text-xs text-ink-faint">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {STATUSES.map((s) => (
            <button key={s.key} onClick={() => setStatus(s.key)} className={`rounded-full border px-3 py-1 text-xs ${status === s.key ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-hover"}`}>
              {s.label}
            </button>
          ))}
          <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
          {(["direct", "role", "anyone"] as Source[]).map((s) => (
            <label key={s} className="flex items-center gap-1 text-xs text-ink-soft">
              <input type="checkbox" checked={sources.includes(s)} onChange={(e) => setSources(e.target.checked ? [...sources, s] : sources.filter((x) => x !== s))} />
              {s === "direct" ? "Assigned to them" : s === "role" ? "Via their roles" : "Open to anyone"}
            </label>
          ))}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="ml-auto rounded-lg border border-line bg-card px-2 py-1 text-xs">
            <option value="due">Sort: next due</option>
            <option value="last">Sort: last done</option>
            <option value="title">Sort: A–Z</option>
          </select>
        </div>

        <ul className="card mt-3 divide-y divide-line">
          {shown.map((t) => {
            const doneNow = t.doneThisCycle || done.has(t.id);
            const st = DUE_LABELS[t.state];
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  disabled={doneNow}
                  onClick={() => complete(t)}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${doneNow ? "border-ok bg-ok text-paper" : "border-line hover:border-ok"}`}
                  title={doneNow ? `Done ${CYCLE_WORD[t.frequency]}` : "Mark done today"}
                  aria-label={`Mark "${t.title}" done`}
                >
                  {doneNow && <Check size={13} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-medium ${doneNow ? "text-ink-faint line-through" : ""}`}>{t.title}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-faint">
                    <span>{CAD_LABEL[t.frequency]}{t.whenText ? ` · ${t.whenText}` : ""}</span>
                    <span>{SOURCE_LABEL[t.source]}{t.source === "role" && t.role ? `: ${t.role.emoji} ${t.role.name}` : ""}</span>
                    {t.category && <span>{t.category}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-right text-[11px] text-ink-faint">
                  <div>
                    <div>Last done</div>
                    <div className="num text-xs text-ink">{fmt(done.has(t.id) ? today : t.lastDoneOn)}</div>
                  </div>
                  <div>
                    <div>Next due</div>
                    <div className="num text-xs text-ink">{fmt(t.nextDueOn)}</div>
                  </div>
                </div>
                <span className={`w-20 rounded px-2 py-0.5 text-center text-[11px] font-medium ${doneNow ? TONE.ok : TONE[st.tone]}`}>{doneNow ? "Done" : t.state === "done" ? "Done" : st.label}</span>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-faint">Nothing matches these filters.</li>}
        </ul>
        <Link href={`/w/${slug}/tasks`} className="mt-2 inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink">
          Edit tasks in the Tracker <ExternalLink size={11} />
        </Link>
      </section>

      {recent.length > 0 && (
        <section className="card mt-6 p-4">
          <h2 className="eyebrow mb-2">Recently completed</h2>
          <ul className="space-y-1 text-sm">
            {recent.map((r, i) => (
              <li key={`${r.taskId}-${r.doneOn}-${i}`} className="flex justify-between gap-3">
                <span className="truncate">{r.title}</span>
                <span className="num shrink-0 text-xs text-ink-faint">{fmt(r.doneOn)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Tile({ label, n, edge, tone, onClick }: { label: string; n: number; edge: string; tone?: string; onClick?: () => void }) {
  const C = onClick ? "button" : "div";
  return (
    <C onClick={onClick} className={`stat-tile ${edge}`}>
      <div className="eyebrow text-[10px] md:text-xs">{label}</div>
      <div className={`num mt-1 text-xl font-bold md:text-2xl ${tone ?? ""}`}>{n}</div>
    </C>
  );
}
