"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronLeft, ChevronRight, ListChecks, PauseCircle, Repeat } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import type { CalData, CalItem } from "@/lib/services/task-calendar";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

const KIND: Record<CalItem["kind"], { label: string; dot: string; chip: string }> = {
  overdue: { label: "Overdue", dot: "bg-danger", chip: "bg-danger-soft text-danger" },
  due: { label: "Due", dot: "bg-warn", chip: "bg-warn-soft text-warn" },
  upcoming: { label: "Upcoming", dot: "bg-ink-faint", chip: "border border-dashed border-line text-ink-soft" },
  done: { label: "Done", dot: "bg-ok", chip: "bg-ok-soft text-ok" },
};

export function TaskCalendar({ slug, month, grid, data, person, me, people }: { slug: string; month: string; grid: { first: string; last: string; gridFrom: string; gridTo: string }; data: CalData; person: string; me: string; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const inMonth = data.today >= grid.first && data.today <= grid.last;
  const [sel, setSel] = useState(inMonth ? data.today : grid.first);
  const [showDone, setShowDone] = useState(true);
  const href = (p: { person?: string; m?: string }) => `/w/${slug}/tasks/calendar?person=${p.person ?? person}&m=${p.m ?? month}`;

  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const i of data.items) if (showDone || i.kind !== "done") m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [data.items, showDone]);
  const days: string[] = [];
  for (let d = grid.gridFrom; d <= grid.gridTo; d = addDays(d, 1)) days.push(d);
  const overdue = data.items.filter((i) => i.kind === "overdue");
  const selItems = byDay.get(sel) ?? [];
  const whoLabel = person === "all" ? "Everyone" : person === me ? "My tasks" : people.find((p) => p.id === person)?.name ?? "Tasks";

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        eyebrow={<Link href={`/w/${slug}/tasks`} className="hover:text-ink">Tracker</Link>}
        title="Task calendar"
        icon={<CalendarDays size={22} className="text-accent" />}
        subtitle="Next due dates are real. Later dates are projected from each task's schedule, assuming it's done on time."
        actions={
          <Link href={`/w/${slug}/tasks`} className="btn btn-sm">
            <ListChecks size={14} /> List view
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {people.length > 0 ? (
          <select value={person} onChange={(e) => router.push(href({ person: e.target.value }))} className="field w-auto min-w-44 py-2" aria-label="Whose tasks">
            <option value={me}>My tasks</option>
            <option value="all">Everyone</option>
            {people.filter((p) => p.id !== me).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-medium">{whoLabel}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Link href={href({ m: shiftMonth(month, -1) })} className="tap-icon rounded-lg p-2 hover:bg-hover" aria-label="Previous month"><ChevronLeft size={18} /></Link>
          <span className="min-w-36 text-center font-semibold">{monthName(month)}</span>
          <Link href={href({ m: shiftMonth(month, 1) })} className="tap-icon rounded-lg p-2 hover:bg-hover" aria-label="Next month"><ChevronRight size={18} /></Link>
          {!inMonth && <Link href={href({ m: data.today.slice(0, 7) })} className="btn btn-sm ml-1">Today</Link>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
        {(["overdue", "due", "upcoming", "done"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${KIND[k].dot}`} /> {KIND[k].label}</span>
        ))}
        <label className="ml-auto flex items-center gap-1.5">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed
        </label>
      </div>

      {overdue.length > 0 && (
        <div className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-sm">
          <span className="font-medium text-danger">{overdue.length} overdue</span>
          <span className="text-ink-soft"> · {overdue.slice(0, 3).map((o) => o.title).join(", ")}{overdue.length > 3 ? "…" : ""}</span>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-medium uppercase tracking-wide text-ink-faint">
          {DOW.map((d) => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const out = d < grid.first || d > grid.last;
            const isToday = d === data.today;
            return (
              <button
                key={d}
                onClick={() => setSel(d)}
                className={`relative flex min-h-14 flex-col items-stretch gap-0.5 border-b border-r border-line p-1 text-left transition md:min-h-28 md:p-1.5 ${out ? "bg-paper/40 text-ink-faint" : ""} ${sel === d ? "bg-accent-soft" : "hover:bg-hover"}`}
                aria-label={`${dayName(d)}: ${items.length} task${items.length === 1 ? "" : "s"}`}
              >
                <span className={`flex h-6 w-6 items-center justify-center self-center rounded-full text-xs md:self-start ${isToday ? "bg-accent font-semibold text-paper" : ""}`}>{Number(d.slice(8))}</span>
                {/* Phone: dots. Computer: names. */}
                <span className="flex flex-wrap justify-center gap-0.5 md:hidden">
                  {items.slice(0, 4).map((i, n) => (
                    <span key={n} className={`h-1.5 w-1.5 rounded-full ${KIND[i.kind].dot}`} />
                  ))}
                  {items.length > 4 && <span className="text-[9px] leading-none text-ink-faint">+</span>}
                </span>
                <span className="hidden space-y-0.5 md:block">
                  {items.slice(0, 3).map((i, n) => (
                    <span key={n} className={`block truncate rounded px-1 py-0.5 text-[11px] leading-tight ${KIND[i.kind].chip}`}>{i.kind === "done" ? "✓ " : ""}{i.title}</span>
                  ))}
                  {items.length > 3 && <span className="block px-1 text-[11px] text-ink-faint">+{items.length - 3} more</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">{sel === data.today ? `Today · ${dayName(sel)}` : dayName(sel)}</h2>
        {selItems.length ? (
          <ul className="card divide-y divide-line">
            {selItems.map((i, n) => (
              <li key={`${i.taskId}-${n}`}>
                <Link href={`/w/${slug}/tasks/${i.taskId}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-hover">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${KIND[i.kind].dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-medium ${i.kind === "done" ? "text-ink-soft" : ""}`}>{i.title}</span>
                    <span className="block text-xs text-ink-faint">
                      {KIND[i.kind].label}
                      {i.kind === "upcoming" && " (projected)"}
                      {i.who && <> · {i.kind === "done" ? `by ${i.who}` : i.who}</>}
                    </span>
                  </span>
                  {i.kind === "done" && <Check size={15} className="shrink-0 text-ok" />}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card px-4 py-6 text-center text-sm text-ink-soft">Nothing scheduled{data.daily.length ? " besides daily tasks" : ""}.</p>
        )}
      </section>

      {data.daily.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Repeat size={14} className="text-accent" /> Every day</h2>
          <div className="flex flex-wrap gap-2">
            {data.daily.map((t) => (
              <Link key={t.taskId} href={`/w/${slug}/tasks/${t.taskId}`} className="rounded-full border border-line bg-card px-3 py-1.5 text-sm hover:bg-hover">
                {t.title}{person === "all" && t.who ? <span className="text-ink-faint"> · {t.who}</span> : null}
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.onHold.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><PauseCircle size={14} /> On hold</h2>
          <div className="flex flex-wrap gap-2">
            {data.onHold.map((t) => (
              <Link key={t.taskId} href={`/w/${slug}/tasks/${t.taskId}`} className="rounded-full border border-dashed border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-hover">{t.title}</Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
