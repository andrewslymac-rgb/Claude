"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, ChevronRight, Copy, ListPlus, Plus, Upload, FolderPlus, Gavel, ListChecks, MessagesSquare, RefreshCw, Search, Settings2, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { addMeetingAction, bulkMeetingStepsAction, addMeetingSourceAction, removeMeetingSourceAction, setMeetingAutoTasksAction, setMeetingPersonAction, setMeetingSeriesSharedAction, syncMeetingsAction } from "@/app/actions";
import { StepRow, fmtDay, type MeetingView } from "./shared";
import { AskBox } from "./AskBox";

type Name = { name: string; steps: number; match: string };
type Person = { id: string; name: string };

type Source = { id: string; label: string; folderId: string; lastSyncedAt: string | null; lastError: string | null };
type Tab = "meetings" | "steps" | "decisions";
const PREF = "orbit.meetings.prefs";
const CADENCES = [["once", "One-off"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["annual", "Annual"]] as const;
type GroupBy = "none" | "meeting" | "person" | "type";
type StepSort = "oldest" | "newest";

export function MeetingsView({ slug, company, isAdmin, canMakeTasks, orbitDriveEmail, sources, shared, meetings, autoTasksFrom, team, names, aiEnabled }: { aiEnabled: boolean; slug: string; company: string; isAdmin: boolean; canMakeTasks: boolean; orbitDriveEmail: string | null; sources: Source[]; shared: string[]; meetings: MeetingView[]; autoTasksFrom: string | null; team: Person[]; names: Name[] }) {
  const [tab, setTab] = useState<Tab>("meetings");
  const [q, setQ] = useState("");
  const [series, setSeries] = useState<string>("all");
  const [person, setPerson] = useState<string>("all");
  const [range, setRange] = useState<"30" | "90" | "all">("90");
  const [stepView, setStepView] = useState<"open" | "task" | "done" | "all">("open");
  const [groupBy, setGroupBy] = useState<GroupBy>("meeting");
  const [stepSort, setStepSort] = useState<StepSort>("oldest");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkAssign, setBulkAssign] = useState(false);
  const [bulkWho, setBulkWho] = useState("auto");
  const [bulkFreq, setBulkFreq] = useState<(typeof CADENCES)[number][0]>("once");
  const [bulkDue, setBulkDue] = useState("");
  const [armed, setArmed] = useState(false);
  const [setup, setSetup] = useState(isAdmin && sources.length === 0 && meetings.length === 0);
  const [adding, setAdding] = useState(false);
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  // Your view is remembered on this device.
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) ?? "{}");
      if (p.tab) setTab(p.tab);
      if (p.range) setRange(p.range);
      if (p.stepView) setStepView(p.stepView);
      if (p.groupBy) setGroupBy(p.groupBy);
      if (p.stepSort) setStepSort(p.stepSort);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREF, JSON.stringify({ tab, range, stepView, groupBy, stepSort }));
    } catch {}
  }, [tab, range, stepView, groupBy, stepSort]);

  const seriesCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of meetings) c.set(m.series, (c.get(m.series) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [meetings]);
  const people = useMemo(() => {
    const s = new Set<string>();
    for (const m of meetings) {
      m.attendees.forEach((a) => s.add(a));
      m.nextSteps.forEach((n) => n.owner && s.add(n.owner));
    }
    return [...s].sort();
  }, [meetings]);

  const cutoff = range === "all" ? "" : new Date(Date.now() - Number(range) * 864e5).toISOString();
  const needle = q.trim().toLowerCase();
  const shown = meetings.filter((m) => {
    if (series !== "all" && m.series !== series) return false;
    if (cutoff && m.at < cutoff) return false;
    if (person !== "all" && !m.attendees.includes(person) && !m.nextSteps.some((n) => n.owner === person)) return false;
    if (!needle) return true;
    const hay = [m.series, m.summary, ...m.points.flatMap((p) => [p.title, p.text]), ...m.decisions.flatMap((d) => [d.title, d.text]), ...m.nextSteps.flatMap((n) => [n.owner ?? "", n.title, n.text]), ...m.topics.flatMap((t) => [t.title, t.text]), ...m.attendees].join(" ").toLowerCase();
    return hay.includes(needle);
  });
  // "Still open" = nobody has it yet, or its task isn't done. Oldest first, so forgotten items surface.
  const allSteps = shown.flatMap((m) => m.nextSteps.map((s, i) => ({ m, s, i, st: m.status[i] ?? { status: "open" as const } }))).filter(({ s }) => person === "all" || s.owner === person);
  // "To review" = nobody has dealt with it yet: no task, not done, not dismissed.
  const openCount = allSteps.filter(({ st }) => st.status === "open").length;
  const taskCount = allSteps.filter(({ st }) => st.status === "task").length;
  const steps = allSteps
    .filter(({ st }) => (stepView === "all" ? true : st.status === stepView))
  const suggest = new Map(names.filter((n) => n.match && n.match !== "none").map((n) => [n.name, n.match]));
  const stepsSorted = steps.sort((a, b) => (stepSort === "oldest" ? a.m.at.localeCompare(b.m.at) : b.m.at.localeCompare(a.m.at)));
  const keyOf = (x: { m: MeetingView; i: number }) => `${x.m.id}:${x.i}`;
  // Group the list so a whole meeting (or person) can be reviewed, and selected, in one go.
  const groups: { key: string; label: string; href?: string; items: typeof stepsSorted }[] = [];
  for (const x of stepsSorted) {
    const [key, label, href] =
      groupBy === "meeting" ? [x.m.id, `${x.m.series} · ${fmtDay(x.m.at)}`, `/w/${slug}/meetings/${x.m.id}`] : groupBy === "person" ? [x.s.owner ?? "", x.s.owner ?? "Nobody named", undefined] : groupBy === "type" ? [x.m.series, x.m.series, undefined] : ["all", "", undefined];
    const g = groups.find((y) => y.key === key);
    if (g) g.items.push(x);
    else groups.push({ key, label, href, items: [x] });
  }
  const reviewing = stepView === "open" && canMakeTasks;
  const shownKeys = reviewing ? stepsSorted.map(keyOf) : [];
  const chosen = shownKeys.filter((k) => picked.has(k));
  const toItems = (keys: string[]) => keys.map((k) => ({ meetingId: k.split(":")[0], index: Number(k.split(":")[1]) }));
  const pick = (keys: string[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const k of keys) if (on) next.add(k); else next.delete(k);
      return next;
    });
  const bulk = (keys: string[], op: "done" | "not_needed" | "task", choice?: { assigneeId?: string | null; frequency?: string; dueOn?: string | null }) =>
    start(async () => {
      const r = await bulkMeetingStepsAction(slug, toItems(keys), op, choice);
      toast(r.ok ? r.message ?? "Done" : r.error, r.ok);
      if (r.ok) {
        setPicked(new Set());
        setBulkAssign(false);
        setArmed(false);
        router.refresh();
      }
    });
  // "Clear all" needs a second click within a few seconds, so it can't happen by accident.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const decisions = shown.flatMap((m) => m.decisions.map((d) => ({ m, d })));

  // Group meetings by month for the list.
  const byMonth = new Map<string, MeetingView[]>();
  for (const m of shown) {
    const k = new Date(m.at).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Los_Angeles" });
    byMonth.set(k, [...(byMonth.get(k) ?? []), m]);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        eyebrow={company}
        title="Meetings"
        icon={<MessagesSquare size={22} className="text-accent" />}
        subtitle="Summaries, decisions and next steps from your Google Meet notes. The full notes and transcript stay in Google Docs."
        actions={
          isAdmin ? (
            <>
              <button onClick={() => start(async () => { const r = await syncMeetingsAction(slug); toast(r.ok ? r.message ?? "Synced" : r.error, r.ok); router.refresh(); })} disabled={busy || !sources.length} className="btn btn-sm">
                <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Sync now
              </button>
              <button onClick={() => setAdding((o) => !o)} className="btn btn-sm">
                <Plus size={14} /> Add a meeting
              </button>
              <button onClick={() => setSetup((o) => !o)} className="btn btn-sm">
                <Settings2 size={14} /> Sources and sharing
              </button>
            </>
          ) : null
        }
      />

      {isAdmin && adding && <AddMeetingPanel slug={slug} aiEnabled={aiEnabled} names={seriesCounts.map(([n]) => n)} onClose={() => setAdding(false)} />}

      {isAdmin && setup && <SetupPanel slug={slug} orbitDriveEmail={orbitDriveEmail} sources={sources} seriesCounts={seriesCounts} shared={shared} autoTasksFrom={autoTasksFrom} team={team} names={names} />}

      {!meetings.length ? (
        <div className="card px-4 py-10 text-center text-sm text-ink-soft">
          {isAdmin ? "No meetings yet. Connect your Google Meet notes folder under Sources and sharing, or use Add a meeting for one held somewhere else." : "No meetings have been shared with the team yet."}
        </div>
      ) : (
        <>
          <AskBox slug={slug} enabled={aiEnabled} isAdmin={isAdmin} />

          <div className="flex gap-1 border-b border-line">
            {([
              ["meetings", "Meetings", <MessagesSquare key="m" size={14} />, shown.length],
              ["steps", "To review", <ListChecks key="s" size={14} />, openCount],
              ["decisions", "Decisions", <Gavel key="d" size={14} />, decisions.length],
            ] as const).map(([k, label, icon, n]) => (
              <button key={k} onClick={() => setTab(k)} className={`-mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm ${tab === k ? "border-accent font-medium text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>
                {icon} {label} <span className="num text-xs text-ink-faint">{n}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topics, decisions, people…" className="field pl-9" aria-label="Search meetings" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <select value={series} onChange={(e) => setSeries(e.target.value)} className="field py-2" aria-label="Meeting type">
                <option value="all">All meeting types</option>
                {seriesCounts.map(([s, n]) => (
                  <option key={s} value={s}>{s} ({n})</option>
                ))}
              </select>
              <select value={person} onChange={(e) => setPerson(e.target.value)} className="field py-2" aria-label="Person">
                <option value="all">Anyone</option>
                {people.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} className="field col-span-2 py-2 sm:col-span-1" aria-label="Date range">
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All time</option>
              </select>
            </div>
          </div>

          {tab === "meetings" &&
            (shown.length ? (
              [...byMonth.entries()].map(([month, ms]) => (
                <section key={month}>
                  <h2 className="eyebrow mb-2">{month}</h2>
                  <ul className="card divide-y divide-line">
                    {ms.map((m) => {
                      const open = m.status.filter((x) => x.status === "open").length;
                      return (
                        <li key={m.id}>
                          <Link href={`/w/${slug}/meetings/${m.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-hover">
                            <div className="w-12 shrink-0 text-center">
                              <div className="text-[11px] uppercase text-ink-faint">{fmtDay(m.at).split(",")[0]}</div>
                              <div className="text-lg font-semibold leading-tight">{new Date(m.at).toLocaleDateString("en-US", { day: "numeric", timeZone: "America/Los_Angeles" })}</div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">
                                {m.series}
                                {m.platform && <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[11px] font-normal text-ink-soft">{m.platform}</span>}
                              </div>
                              {m.summary && <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{m.summary}</p>}
                              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-faint">
                                {m.decisions.length > 0 && <span>{m.decisions.length} decision{m.decisions.length === 1 ? "" : "s"}</span>}
                                {m.nextSteps.length > 0 && <span className={open ? "text-accent" : ""}>{m.nextSteps.length} next step{m.nextSteps.length === 1 ? "" : "s"}{open && open < m.nextSteps.length ? ` (${open} open)` : ""}</span>}
                                {m.attendees.length > 0 && <span className="flex items-center gap-1"><Users size={11} /> {m.attendees.length}</span>}
                              </div>
                            </div>
                            <ChevronRight size={16} className="mt-1 shrink-0 text-ink-faint" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            ) : (
              <p className="card px-4 py-8 text-center text-sm text-ink-soft">No meetings match.</p>
            ))}

          {tab === "steps" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {([["open", `To review (${openCount})`], ["task", `Assigned (${taskCount})`], ["done", "Closed"], ["all", "All"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setStepView(k)} className={`min-h-9 rounded-full border px-3 text-sm ${stepView === k ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-hover"}`}>{label}</button>
                ))}
                {stepView === "open" && <span className="text-xs text-ink-faint">Action items from your meetings that nobody owns yet. Assign, mark done or close as not needed, one at a time or tick several.</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="field w-auto py-2" aria-label="Group by">
                  <option value="meeting">Group by meeting</option>
                  <option value="person">Group by person</option>
                  <option value="type">Group by meeting type</option>
                  <option value="none">No grouping</option>
                </select>
                <select value={stepSort} onChange={(e) => setStepSort(e.target.value as StepSort)} className="field w-auto py-2" aria-label="Sort">
                  <option value="oldest">Oldest first</option>
                  <option value="newest">Newest first</option>
                </select>
                {reviewing && shownKeys.length > 0 && (
                  <>
                    <button onClick={() => pick(shownKeys, chosen.length !== shownKeys.length)} className="btn btn-sm">
                      {chosen.length === shownKeys.length ? "Select none" : `Select all ${shownKeys.length}`}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => (armed ? bulk(shownKeys, "not_needed") : setArmed(true))}
                      className={`btn btn-sm ml-auto ${armed ? "border-danger text-danger" : ""}`}
                      title="Closes everything in this list as not needed. Click twice to confirm."
                    >
                      <Ban size={14} /> {armed ? `Click again to clear all ${shownKeys.length}` : `Clear all ${shownKeys.length}`}
                    </button>
                  </>
                )}
              </div>

              {reviewing && chosen.length > 0 && (
                <div className="sticky top-2 z-10 space-y-2 rounded-xl border border-accent/40 bg-card p-3 shadow-lg">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{chosen.length} selected</span>
                    <button disabled={busy} onClick={() => setBulkAssign((o) => !o)} className="btn btn-primary btn-sm"><ListPlus size={14} /> Assign</button>
                    <button disabled={busy} onClick={() => bulk(chosen, "done")} className="btn btn-sm"><Check size={14} /> Done</button>
                    <button disabled={busy} onClick={() => bulk(chosen, "not_needed")} className="btn btn-sm"><Ban size={14} /> Not needed</button>
                    <button onClick={() => { setPicked(new Set()); setBulkAssign(false); }} className="btn btn-ghost btn-sm ml-auto">Cancel</button>
                  </div>
                  {bulkAssign && (
                    <form
                      className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
                      onSubmit={(e) => {
                        e.preventDefault();
                        bulk(chosen, "task", { ...(bulkWho === "auto" ? {} : { assigneeId: bulkWho || null }), frequency: bulkFreq, dueOn: bulkDue || null });
                      }}
                    >
                      <label className="text-xs text-ink-soft">
                        Who owns them
                        <select value={bulkWho} onChange={(e) => setBulkWho(e.target.value)} className="field mt-1" aria-label="Who owns them">
                          <option value="auto">The person named in the notes</option>
                          <option value="">Anyone</option>
                          {team.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-ink-soft">
                        How often
                        <select value={bulkFreq} onChange={(e) => setBulkFreq(e.target.value as typeof bulkFreq)} className="field mt-1" aria-label="How often">
                          {CADENCES.map(([k, l]) => (
                            <option key={k} value={k}>{l}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-ink-soft">
                        {bulkFreq === "once" ? "Due" : "First due"}
                        <input type="date" value={bulkDue} onChange={(e) => setBulkDue(e.target.value)} className="field mt-1" aria-label="Due date" />
                      </label>
                      <button type="submit" disabled={busy} className="btn btn-primary btn-sm">Create {chosen.length} task{chosen.length === 1 ? "" : "s"}</button>
                    </form>
                  )}
                </div>
              )}

              {stepsSorted.length ? (
                groups.map((g) => {
                  const keys = g.items.map(keyOf);
                  const on = keys.filter((k) => picked.has(k)).length;
                  return (
                    <section key={g.key}>
                      {groupBy !== "none" && (
                        <div className="mb-1.5 flex items-center gap-2 px-1">
                          {reviewing && <input type="checkbox" className="size-4" checked={on === keys.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < keys.length; }} onChange={(e) => pick(keys, e.target.checked)} aria-label={`Select all in ${g.label}`} />}
                          {g.href ? <Link href={g.href} className="eyebrow hover:text-ink">{g.label}</Link> : <h2 className="eyebrow">{g.label}</h2>}
                          <span className="num text-xs text-ink-faint">{g.items.length}</span>
                        </div>
                      )}
                      <ul className="card divide-y divide-line">
                        {g.items.map(({ m, s, i, st }) => (
                          <StepRow key={`${m.id}-${i}`} slug={slug} meetingId={m.id} index={i} step={s} status={st} meetingAt={m.at} canMakeTasks={canMakeTasks} team={team} suggestedId={s.owner ? suggest.get(s.owner) ?? null : null} meetingLabel={groupBy === "meeting" ? undefined : { href: `/w/${slug}/meetings/${m.id}`, text: `${m.series} · ${fmtDay(m.at)}` }} selected={picked.has(`${m.id}:${i}`)} onSelect={reviewing ? (v) => pick([`${m.id}:${i}`], v) : undefined} />
                        ))}
                      </ul>
                    </section>
                  );
                })
              ) : (
                <p className="card px-4 py-8 text-center text-sm text-ink-soft">{stepView === "open" ? "Nothing to review. Every action item has an owner or is closed." : "Nothing here."}</p>
              )}
            </>
          )}

          {tab === "decisions" &&
            (decisions.length ? (
              <ul className="card divide-y divide-line">
                {decisions.map(({ m, d }, i) => (
                  <li key={i} className="px-4 py-3 text-sm">
                    <div className="font-medium">{d.title}</div>
                    {d.text && <p className="mt-0.5 text-ink-soft">{d.text}</p>}
                    <Link href={`/w/${slug}/meetings/${m.id}`} className="mt-1 inline-block text-xs text-ink-faint hover:text-ink">{m.series} · {fmtDay(m.at)}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="card px-4 py-8 text-center text-sm text-ink-soft">No decisions match.</p>
            ))}
        </>
      )}
    </div>
  );
}

const PLATFORM_CHOICES = ["Zoom", "Microsoft Teams", "Phone call", "In person", "Other"];
const TEXT_LIMIT = 300_000;

/** Owners and admins: add a meeting held outside Google Meet by pasting or uploading its notes or transcript. */
function AddMeetingPanel({ slug, aiEnabled, names, onClose }: { slug: string; aiEnabled: boolean; names: string[]; onClose: () => void }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [platform, setPlatform] = useState(PLATFORM_CHOICES[0]);
  const [attendees, setAttendees] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const readFile = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.(txt|md|vtt|srt|csv|json)$/i.test(f.name) && !f.type.startsWith("text/")) return toast("Choose a text file (.txt, .md, .vtt or .srt). For a Word doc or PDF, copy the text and paste it.", false);
    const body = await f.text();
    setText(body);
    setFileName(f.name);
    if (!title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").slice(0, 120));
  };
  const over = text.length > TEXT_LIMIT;
  return (
    <form
      className="card space-y-3 p-4 text-sm md:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addMeetingAction(slug, { title, date, time, platform, attendees, text });
          toast(r.ok ? r.message : r.error, r.ok);
          if (r.ok) {
            onClose();
            router.push(`/w/${slug}/meetings/${r.id}`);
            router.refresh();
          }
        });
      }}
    >
      <div>
        <h2 className="font-semibold">Add a meeting</h2>
        <p className="mt-1 text-ink-soft">
          For meetings held outside Google Meet. Paste the notes or transcript, or choose a text file.{" "}
          {aiEnabled ? "Orbit writes the summary, decisions and next steps from it, and the next steps go to To review." : "Without the AI key Orbit saves the text but can't pull out the summary or next steps."}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-ink-soft sm:col-span-2">
          Meeting name
          <input value={title} onChange={(e) => setTitle(e.target.value)} list="meeting-names" required maxLength={120} placeholder="e.g. Vendor call with Univar" className="field mt-1" />
          <datalist id="meeting-names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <label className="text-xs text-ink-soft">
          Date
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required className="field mt-1" />
        </label>
        <label className="text-xs text-ink-soft">
          Time (optional)
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field mt-1" />
        </label>
        <label className="text-xs text-ink-soft">
          Where it was held
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="field mt-1">
            {PLATFORM_CHOICES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-soft">
          Who was there (optional)
          <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="Names, separated by commas" className="field mt-1" />
        </label>
      </div>
      <label className="block text-xs text-ink-soft">
        Notes or transcript
        <textarea value={text} onChange={(e) => { setText(e.target.value); setFileName(""); }} rows={8} placeholder="Paste here…" className="field mt-1 font-mono text-xs" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn btn-sm cursor-pointer">
          <Upload size={14} /> Choose a file
          <input type="file" accept=".txt,.md,.vtt,.srt,.csv,text/*" className="hidden" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <span className={`text-xs ${over ? "text-danger" : "text-ink-faint"}`}>
          {fileName ? `${fileName} · ` : ""}
          {text.length ? `${text.length < 1000 ? text.length : `${Math.round(text.length / 1000)}k`} characters` : "Text files only: .txt, .md, .vtt, .srt"}
          {over ? ` (limit ${TEXT_LIMIT / 1000}k: split it into two meetings)` : ""}
        </span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button disabled={busy || !title.trim() || text.trim().length < 40 || over} className="btn btn-primary btn-sm">{busy ? "Reading… this can take a minute" : "Add meeting"}</button>
        </span>
      </div>
    </form>
  );
}

/** Owners and admins: which Drive folders to read, and which meeting types the whole team can see. */
function SetupPanel({ slug, orbitDriveEmail, sources, seriesCounts, shared, autoTasksFrom, team, names }: { slug: string; orbitDriveEmail: string | null; sources: Source[]; seriesCounts: [string, number][]; shared: string[]; autoTasksFrom: string | null; team: Person[]; names: Name[] }) {
  const [link, setLink] = useState("");
  const [label, setLabel] = useState("");
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "not yet");
  return (
    <div className="card space-y-5 p-4 text-sm md:p-5">
      <div>
        <h2 className="font-semibold">Where meeting notes come from</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-soft">
          <li>In Google Drive, find the <b>Meet Recordings</b> folder (Gemini saves its notes there) for each account that hosts meetings.</li>
          <li>
            Share it as <b>Viewer</b> with Orbit&apos;s Drive address
            {orbitDriveEmail ? (
              <>
                : <code className="break-all rounded bg-paper px-1.5 py-0.5 text-xs">{orbitDriveEmail}</code>{" "}
                <button onClick={() => navigator.clipboard.writeText(orbitDriveEmail).then(() => toast("Copied"))} className="inline-flex items-center gap-1 text-accent"><Copy size={12} /> copy</button>
              </>
            ) : (
              <> (set up Google Drive in Settings → Documents &amp; sync first).</>
            )}
          </li>
          <li>Paste the folder link below. Orbit checks for new notes every 30 minutes.</li>
        </ol>
      </div>

      {sources.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {sources.map((s) => (
            <li key={s.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <a href={`https://drive.google.com/drive/folders/${s.folderId}`} target="_blank" rel="noopener noreferrer" className="font-medium text-accent">{s.label}</a>
                <div className="text-xs text-ink-faint">Last checked {ago(s.lastSyncedAt)}</div>
                {s.lastError && <div className="mt-0.5 text-xs text-warn">{s.lastError}</div>}
              </div>
              <button onClick={() => confirm(`Stop reading "${s.label}"? Its meetings leave Orbit; nothing changes in Google Drive.`) && start(async () => { const r = await removeMeetingSourceAction(slug, s.id); if (!r.ok) toast(r.error, false); router.refresh(); })} disabled={busy} className="tap-icon rounded p-1.5 text-ink-faint hover:text-danger" aria-label={`Remove ${s.label}`}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addMeetingSourceAction(slug, link, label);
            toast(r.ok ? r.message ?? "Connected" : r.error, r.ok);
            if (r.ok) {
              setLink("");
              setLabel("");
              router.refresh();
            }
          });
        }}
      >
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" inputMode="url" className="field" aria-label="Drive folder link" />
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name, e.g. Andrew's Meet Recordings (optional)" maxLength={80} className="field min-w-0 flex-1" />
          <button disabled={busy || !link.trim()} className="btn btn-primary shrink-0">
            <FolderPlus size={15} /> {busy ? "Reading…" : "Connect"}
          </button>
        </div>
      </form>

      {names.length > 0 && (
        <div>
          <h2 className="font-semibold">Match names to people</h2>
          <p className="mt-1 text-ink-soft">Gemini names people the way Google Meet shows them (sometimes an account name like &ldquo;Office Manager&rdquo;). Match each to someone in Orbit so their next steps land on the right task list.</p>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
            {names.map((n) => (
              <li key={n.name} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  {n.name}
                  {n.steps > 0 && <span className="ml-1 text-xs text-ink-faint">· {n.steps} next step{n.steps === 1 ? "" : "s"}</span>}
                </span>
                <select
                  defaultValue={n.match}
                  onChange={(e) => start(async () => { const r = await setMeetingPersonAction(slug, n.name, e.target.value); if (!r.ok) toast(r.error, false); })}
                  className="field w-auto min-w-40 py-1.5"
                  aria-label={`Who is ${n.name}`}
                >
                  <option value="">Not matched yet</option>
                  {team.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  <option value="none">Not on the team</option>
                </select>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-3 rounded-lg border border-line p-3">
            <input
              type="checkbox"
              className="mt-1"
              defaultChecked={Boolean(autoTasksFrom)}
              onChange={(e) => start(async () => { const r = await setMeetingAutoTasksAction(slug, e.target.checked); toast(r.ok ? r.message ?? "Saved" : r.error, r.ok); router.refresh(); })}
            />
            <span>
              <span className="font-medium">Create tasks automatically</span>
              <span className="block text-ink-soft">
                Next steps from new meetings become one-off tasks for the matched person, due in 3 days and labelled with the meeting&apos;s day and time.
                {autoTasksFrom ? ` On since ${new Date(autoTasksFrom).toLocaleDateString("en-US", { month: "short", day: "numeric" })}; older meetings are left alone.` : " Older meetings are left alone; use their Task buttons."}
              </span>
            </span>
          </label>
        </div>
      )}

      {seriesCounts.length > 0 && (
        <div>
          <h2 className="font-semibold">Who can see which meetings</h2>
          <p className="mt-1 text-ink-soft">Owners and admins see everything. Tick a meeting type to show it to everyone in the company too. Leave payroll, interviews and one-on-ones unticked.</p>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
            {seriesCounts.map(([s, n]) => (
              <li key={s}>
                <label className="flex min-h-11 items-center gap-3 px-3 py-2">
                  <input type="checkbox" defaultChecked={shared.includes(s)} onChange={(e) => start(async () => { const r = await setMeetingSeriesSharedAction(slug, s, e.target.checked); if (!r.ok) toast(r.error, false); })} />
                  <span className="min-w-0 flex-1">{s}</span>
                  <span className="text-xs text-ink-faint">{n}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
