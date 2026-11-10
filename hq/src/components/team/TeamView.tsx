"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Frequency } from "@/db/schema";
import type { PersonSummary } from "@/lib/services/team";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar, CadenceBar, CAD_LABEL, CAD_SHORT, Ring } from "./shared";

type Sort = "attention" | "name" | "done" | "ontrack";
const SORTS: { key: Sort; label: string }[] = [
  { key: "attention", label: "Needs attention" },
  { key: "ontrack", label: "Least on track" },
  { key: "done", label: "Most done (30 days)" },
  { key: "name", label: "Name" },
];
const SHOWN: Frequency[] = ["daily", "weekly", "monthly", "quarterly", "annual"];
const PREF = "orbit.team.prefs";

export function TeamView({ slug, people }: { slug: string; people: PersonSummary[] }) {
  const [sort, setSort] = useState<Sort>("attention");
  const [hideEmpty, setHideEmpty] = useState(false);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) ?? "{}");
      if (p.sort) setSort(p.sort);
      if (typeof p.hideEmpty === "boolean") setHideEmpty(p.hideEmpty);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREF, JSON.stringify({ sort, hideEmpty }));
    } catch {}
  }, [sort, hideEmpty]);

  const list = useMemo(() => {
    const l = people.filter((p) => !hideEmpty || p.total > 0 || p.done30 > 0);
    const by: Record<Sort, (a: PersonSummary, b: PersonSummary) => number> = {
      attention: (a, b) => b.overdue - a.overdue || b.dueToday - a.dueToday || a.name.localeCompare(b.name),
      ontrack: (a, b) => a.onTrack - b.onTrack || a.name.localeCompare(b.name),
      done: (a, b) => b.done30 - a.done30 || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...l].sort(by[sort]);
  }, [people, sort, hideEmpty]);

  const totals = people.reduce((t, p) => ({ overdue: t.overdue + p.overdue, today: t.today + p.dueToday, week: t.week + p.doneThisWeek }), { overdue: 0, today: 0, week: 0 });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <PageHeader eyebrow="People" title="Team" subtitle="Who holds what, and how each person is tracking on their daily, weekly, monthly, quarterly and annual work. Click a person for the full picture." />

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="stat-tile border-t-danger">
          <div className="eyebrow">Overdue, team-wide</div>
          <div className="num mt-1 text-2xl font-bold text-danger">{totals.overdue}</div>
        </div>
        <div className="stat-tile border-t-warn">
          <div className="eyebrow">Due today</div>
          <div className="num mt-1 text-2xl font-bold text-warn">{totals.today}</div>
        </div>
        <div className="stat-tile border-t-ok">
          <div className="eyebrow">Done this week</div>
          <div className="num mt-1 text-2xl font-bold text-ok">{totals.week}</div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-ink-soft">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-ink-soft">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Hide people with no tasks
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <Link key={p.userId} href={`/w/${slug}/team/${p.userId}`} className="card group flex flex-col gap-4 p-4 transition hover:border-accent">
            <div className="flex items-center gap-3">
              <Avatar name={p.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold group-hover:text-accent">{p.name}</div>
                <div className="flex flex-wrap gap-1 text-[11px] text-ink-faint">
                  {p.jobRoles.length ? p.jobRoles.map((r) => <span key={r.id}>{r.emoji} {r.name}</span>) : <span className="capitalize">{p.role}</span>}
                </div>
              </div>
              <Ring pct={p.onTrack} size={48} />
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat n={p.total} label="open" />
              <Stat n={p.overdue} label="overdue" tone={p.overdue ? "text-danger" : undefined} />
              <Stat n={p.dueToday} label="today" tone={p.dueToday ? "text-warn" : undefined} />
              <Stat n={p.doneThisWeek} label="done wk" tone={p.doneThisWeek ? "text-ok" : undefined} />
            </div>
            <div className="space-y-1.5">
              {SHOWN.map((f) => {
                const c = p.cadences.find((x) => x.freq === f)!;
                return (
                  <div key={f} className="grid grid-cols-[1.5rem_1fr_2.75rem] items-center gap-2 text-[11px] text-ink-faint" title={`${CAD_LABEL[f]}: ${c.done} of ${c.total} done${c.overdue ? `, ${c.overdue} overdue` : ""}`}>
                    <span className="font-semibold">{CAD_SHORT[f]}</span>
                    <CadenceBar {...c} />
                    <span className="num text-right">{c.total ? `${c.done}/${c.total}` : "–"}</span>
                  </div>
                );
              })}
            </div>
          </Link>
        ))}
      </div>
      {list.length === 0 && <div className="mt-6 rounded-xl border border-dashed border-line p-6 text-center text-ink-faint">Nobody to show. Add people in Settings → People.</div>}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-side/60 py-1.5">
      <div className={`num text-lg font-bold ${tone ?? ""}`}>{n}</div>
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
