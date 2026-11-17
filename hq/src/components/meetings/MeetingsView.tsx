"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Copy, FolderPlus, Gavel, ListChecks, MessagesSquare, RefreshCw, Search, Settings2, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { addMeetingSourceAction, removeMeetingSourceAction, setMeetingAutoTasksAction, setMeetingPersonAction, setMeetingSeriesSharedAction, syncMeetingsAction } from "@/app/actions";
import { StepRow, fmtDay, type MeetingView } from "./shared";
import { AskBox } from "./AskBox";

type Name = { name: string; steps: number; match: string };
type Person = { id: string; name: string };

type Source = { id: string; label: string; folderId: string; lastSyncedAt: string | null; lastError: string | null };
type Tab = "meetings" | "steps" | "decisions";
const PREF = "orbit.meetings.prefs";

export function MeetingsView({ slug, company, isAdmin, canMakeTasks, orbitDriveEmail, sources, shared, meetings, autoTasksFrom, team, names, aiEnabled }: { aiEnabled: boolean; slug: string; company: string; isAdmin: boolean; canMakeTasks: boolean; orbitDriveEmail: string | null; sources: Source[]; shared: string[]; meetings: MeetingView[]; autoTasksFrom: string | null; team: Person[]; names: Name[] }) {
  const [tab, setTab] = useState<Tab>("meetings");
  const [q, setQ] = useState("");
  const [series, setSeries] = useState<string>("all");
  const [person, setPerson] = useState<string>("all");
  const [range, setRange] = useState<"30" | "90" | "all">("90");
  const [stepView, setStepView] = useState<"open" | "task" | "done" | "all">("open");
  const [setup, setSetup] = useState(isAdmin && sources.length === 0);
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
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREF, JSON.stringify({ tab, range, stepView }));
    } catch {}
  }, [tab, range, stepView]);

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
  const stepsSorted = steps
    .sort((a, b) => (stepView === "open" ? a.m.at.localeCompare(b.m.at) : b.m.at.localeCompare(a.m.at)));
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
              <button onClick={() => setSetup((o) => !o)} className="btn btn-sm">
                <Settings2 size={14} /> Sources and sharing
              </button>
            </>
          ) : null
        }
      />

      {isAdmin && setup && <SetupPanel slug={slug} orbitDriveEmail={orbitDriveEmail} sources={sources} seriesCounts={seriesCounts} shared={shared} autoTasksFrom={autoTasksFrom} team={team} names={names} />}

      {!meetings.length ? (
        <div className="card px-4 py-10 text-center text-sm text-ink-soft">
          {isAdmin ? "No meetings yet. Connect your Google Meet notes folder under Sources and sharing." : "No meetings have been shared with the team yet."}
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
                              <div className="font-medium">{m.series}</div>
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
                {stepView === "open" && <span className="text-xs text-ink-faint">Action items from your meetings that nobody owns yet. Assign each one, mark it done, or close it as not needed. Oldest first.</span>}
              </div>
              {stepsSorted.length ? (
                <ul className="card divide-y divide-line">
                  {stepsSorted.map(({ m, s, i, st }) => (
                    <StepRow key={`${m.id}-${i}`} slug={slug} meetingId={m.id} index={i} step={s} status={st} meetingAt={m.at} canMakeTasks={canMakeTasks} team={team} suggestedId={s.owner ? suggest.get(s.owner) ?? null : null} meetingLabel={{ href: `/w/${slug}/meetings/${m.id}`, text: `${m.series} · ${fmtDay(m.at)}` }} />
                  ))}
                </ul>
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
