"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, X, SkipForward, AlertTriangle, Users, CalendarDays } from "lucide-react";
import { completeTaskAction, moveDueAction } from "@/app/actions";
import type { Frequency } from "@/db/schema";
import { FREQUENCY_LABELS, daysBetween, fmtDate, todayISO } from "@/lib/recurrence";

export type OverdueItem = { id: string; title: string; frequency: Frequency; whenText: string | null; nextDueOn: string; assignees: string[]; ownerRole: string | null };

const ORDER: Frequency[] = ["daily", "weekly", "monthly", "quarterly", "annual", "once"];

/**
 * Slide-over listing everything past due: who owns it, when it was due, how many days
 * late. Tick to complete right here, or skip it to the next period. Grouped by person
 * or by cadence; sorted most-overdue first.
 */
export function OverduePanel({ slug, items, me, canEdit, onClose }: { slug: string; items: OverdueItem[]; me: string; canEdit: boolean; onClose: () => void }) {
  const [groupBy, setGroupBy] = useState<"person" | "cadence">("person");
  const [done, setDone] = useState<Record<string, "done" | "skipped">>({});
  const [, start] = useTransition();
  const today = todayISO();
  void me;

  const live = items.filter((t) => !done[t.id]);
  const groups = useMemo(() => {
    const m = new Map<string, OverdueItem[]>();
    for (const t of live) {
      const keys = groupBy === "cadence" ? [FREQUENCY_LABELS[t.frequency]] : t.assignees.length ? t.assignees : [t.ownerRole ?? "Anyone"];
      for (const k of keys) m.set(k, [...(m.get(k) ?? []), t]);
    }
    const entries = Array.from(m.entries()).map(([k, ts]) => [k, ts.sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn))] as const);
    if (groupBy === "cadence") entries.sort((a, b) => ORDER.findIndex((f) => FREQUENCY_LABELS[f] === a[0]) - ORDER.findIndex((f) => FREQUENCY_LABELS[f] === b[0]));
    else entries.sort((a, b) => b[1].length - a[1].length);
    return entries;
  }, [live, groupBy]);

  const complete = (t: OverdueItem) => {
    setDone((d) => ({ ...d, [t.id]: "done" }));
    start(() => completeTaskAction(slug, t.id));
  };
  const skip = (t: OverdueItem) => {
    setDone((d) => ({ ...d, [t.id]: "skipped" }));
    start(async () => void (await moveDueAction(slug, t.id)));
  };
  const late = (iso: string) => daysBetween(iso, today);
  const worst = live.reduce((m, t) => Math.max(m, late(t.nextDueOn)), 0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted) return null;

  // Portal: the sidebar is a transformed drawer on phones, which would trap a fixed overlay inside it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onMouseDown={onClose}>
      <div className="pt-safe pb-safe flex h-full w-full max-w-xl flex-col border-l border-line bg-card shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-line p-4 md:p-5">
          <AlertTriangle size={22} className={`mt-0.5 shrink-0 ${live.length ? "text-danger" : "text-ok"}`} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Past due</h2>
            <p className="text-sm text-ink-soft">{live.length ? `${live.length} item${live.length === 1 ? "" : "s"} · oldest is ${worst} day${worst === 1 ? "" : "s"} late` : "Nothing past due. 🎉"}</p>
          </div>
          <div className="flex rounded-lg border border-line p-0.5 text-xs">
            <button onClick={() => setGroupBy("person")} className={`flex items-center gap-1 rounded-md px-2 py-1 ${groupBy === "person" ? "bg-hover text-ink" : "text-ink-soft"}`}>
              <Users size={12} /> Person
            </button>
            <button onClick={() => setGroupBy("cadence")} className={`flex items-center gap-1 rounded-md px-2 py-1 ${groupBy === "cadence" ? "bg-hover text-ink" : "text-ink-soft"}`}>
              <CalendarDays size={12} /> Cadence
            </button>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-hover" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin md:p-4">
          {groups.map(([name, ts]) => (
            <section key={name} className="mb-4">
              <h3 className="mb-1 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {name} <span className="rounded-full bg-danger-soft px-1.5 text-[10px] text-danger">{ts.length}</span>
              </h3>
              <ul className="divide-y divide-line rounded-xl border border-line bg-side/60">
                {ts.map((t) => {
                  const d = late(t.nextDueOn);
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                      <button onClick={() => complete(t)} title="Mark done" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink-faint text-transparent hover:border-ok hover:bg-ok-soft hover:text-ok">
                        <Check size={15} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <Link href={`/w/${slug}/tasks`} onClick={onClose} className="block truncate text-sm font-medium hover:underline">
                          {t.title}
                        </Link>
                        <div className="truncate text-xs text-ink-faint">
                          {FREQUENCY_LABELS[t.frequency]}
                          {t.whenText ? ` · ${t.whenText}` : ""}
                          {groupBy === "cadence" ? ` · ${t.assignees.join(", ") || t.ownerRole || "Anyone"}` : t.assignees.length > 1 ? ` · with ${t.assignees.join(", ")}` : ""}
                          {` · due ${fmtDate(t.nextDueOn)}`}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${d >= 14 ? "bg-danger text-paper" : d >= 3 ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>{d}d late</span>
                      {canEdit && (
                        <button onClick={() => skip(t)} title="Skip to next period" className="shrink-0 rounded p-1.5 text-ink-faint hover:bg-hover hover:text-ink">
                          <SkipForward size={14} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {Object.keys(done).length > 0 && (
            <p className="px-1 text-xs text-ink-faint">
              {Object.values(done).filter((v) => v === "done").length} completed, {Object.values(done).filter((v) => v === "skipped").length} skipped in this session.
            </p>
          )}
        </div>
        <div className="border-t border-line p-3 text-center text-xs text-ink-faint">
          <Link href={`/w/${slug}/tasks`} onClick={onClose} className="text-accent hover:underline">
            Open the full tracker →
          </Link>
        </div>
      </div>
    </div>,
    document.querySelector("[data-ws-theme]") ?? document.body,
  );
}
