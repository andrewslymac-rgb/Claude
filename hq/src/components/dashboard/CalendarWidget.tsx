"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ExternalLink, MapPin, Plus, RefreshCw, Trash2, AlertCircle, Link2 } from "lucide-react";
import { addIcalFeedAction, removeCalendarAction } from "@/app/actions";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type Ev = { id: string; title: string; start: string; end: string; allDay: boolean; location?: string; link?: string; calendar: string; color?: string; connectionId: string };
type Feed = { connections: { id: string; provider: string; label: string; color: string | null; error: string | null }[]; events: Ev[]; from: string; to: string; fetchedAt: string };

const TZ = "America/Los_Angeles";
const dayKey = (iso: string, allDay: boolean) => (allDay ? iso.slice(0, 10) : new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }));
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(":00", "");
const dayLabel = (key: string, today: string) => {
  if (key === today) return "Today";
  const d = new Date(`${key}T12:00:00`);
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === tomorrow.toLocaleDateString("en-CA")) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
};

/**
 * The signed-in person's own calendar: today and the next few days as an agenda.
 * Connect Google Calendar (OAuth) or paste any iCal feed. Nobody else sees it.
 */
export function CalendarWidget({ slug, days = 7, connected: initiallyConnected, googleEnabled }: { slug: string; days?: number; connected: boolean; googleEnabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const toast = useToast();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(initiallyConnected);
  const [manage, setManage] = useState(false);
  const [addFeed, setAddFeed] = useState(false);
  const connected = feed ? feed.connections.length > 0 : initiallyConnected;

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const r = await fetch(`/api/calendar/events?days=${days}${refresh ? "&refresh=1" : ""}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Couldn't load your calendar.");
        setFeed(j);
        setError("");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [days],
  );

  useEffect(() => {
    if (connected) load();
    const t = setInterval(() => document.visibilityState === "visible" && connected && load(), 5 * 60_000);
    return () => clearInterval(t);
  }, [connected, load]);

  // Coming back from Google: say how it went, then clean the address bar.
  useEffect(() => {
    const status = search.get("calendar");
    if (!status) return;
    const msgs: Record<string, [string, boolean]> = {
      connected: ["Google Calendar connected.", true],
      cancelled: ["Google Calendar wasn't connected.", false],
      expired: ["That sign-in took too long. Try connecting again.", false],
      failed: ["Google didn't finish connecting. Try again.", false],
      not_configured: ["Google Calendar isn't set up on this Orbit yet. Use an iCal feed instead.", false],
    };
    const m = msgs[status];
    if (m) toast(m[0], m[1]);
    router.replace(pathname);
    if (status === "connected") load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const groups = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of feed?.events ?? []) {
      const k = dayKey(e.start, e.allDay);
      if (k < today) continue;
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [feed, today]);
  const todays = groups.find(([k]) => k === today)?.[1] ?? [];
  const nowIso = new Date().toISOString();
  const next = todays.find((e) => !e.allDay && e.start > nowIso);

  if (!connected)
    return (
      <div className="rounded-xl border border-dashed border-line p-5 text-sm">
        <div className="flex items-center gap-2 font-medium text-ink">
          <CalendarDays size={16} className="text-accent" /> See your day here
        </div>
        <p className="mt-1 text-ink-soft">Connect your own calendar. It&apos;s private: teammates see their own, never yours.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {googleEnabled && (
            <a href={`/api/calendar/google?back=${encodeURIComponent(pathname)}`} className="btn btn-primary btn-sm">
              Connect Google Calendar
            </a>
          )}
          <button onClick={() => setAddFeed(true)} className="btn btn-secondary btn-sm">
            <Link2 size={13} /> Add a calendar feed (Outlook, Apple, any iCal link)
          </button>
        </div>
        {addFeed && <AddFeedDialog onClose={() => setAddFeed(false)} onAdded={() => (setAddFeed(false), load(true))} />}
      </div>
    );

  return (
    <div>
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
        <span className="num">{loading && !feed ? "Loading…" : `${todays.length} today · ${(feed?.events.length ?? 0) - todays.length} coming up`}</span>
        {next && (
          <span className="text-ink-soft">
            Next: <span className="font-medium text-ink">{timeOf(next.start)}</span> {next.title}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button onClick={() => load(true)} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover hover:text-ink" title="Refresh">
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setManage(true)} className="rounded px-1.5 py-0.5 hover:bg-hover hover:text-ink">
            Manage
          </button>
        </span>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => load(true)} className="font-medium underline">
            Retry
          </button>
        </div>
      )}
      {feed?.connections.filter((c) => c.error).map((c) => (
        <div key={c.id} className="mt-2 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span className="flex-1">
            <strong>{c.label}:</strong> {c.error}
          </span>
          {c.provider === "google" && (
            <a href={`/api/calendar/google?back=${encodeURIComponent(pathname)}`} className="font-medium underline">
              Reconnect
            </a>
          )}
        </div>
      ))}

      {loading && !feed ? (
        <ul className="mt-3 space-y-2 animate-pulse">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-10 rounded-lg bg-side/70" />
          ))}
        </ul>
      ) : groups.length === 0 ? (
        <p className="mt-4 rounded-lg bg-side/50 px-3 py-4 text-center text-sm text-ink-faint">Nothing on your calendar for the next {days} days.</p>
      ) : (
        <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
          {groups.map(([k, evs]) => (
            <section key={k}>
              <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${k === today ? "text-accent" : "text-ink-faint"}`}>{dayLabel(k, today)}</div>
              <ul className="space-y-0.5">
                {evs.map((e) => {
                  const past = !e.allDay && e.end < nowIso && k === today;
                  const live = !e.allDay && e.start <= nowIso && e.end > nowIso;
                  return (
                    <li key={e.id} className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-hover ${past ? "opacity-50" : ""}`}>
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.color ?? "var(--color-accent)" }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="num w-[4.5rem] shrink-0 text-xs text-ink-soft">{e.allDay ? "All day" : timeOf(e.start)}</span>
                          <span className={`min-w-0 truncate ${live ? "font-semibold text-accent" : ""}`}>{e.title}</span>
                          {live && <span className="shrink-0 rounded bg-accent-soft px-1.5 text-[10px] font-semibold text-accent">Now</span>}
                        </div>
                        {(e.location || !e.allDay) && (
                          <div className="ml-[4.5rem] flex flex-wrap gap-x-2 truncate pl-2 text-[11px] text-ink-faint">
                            {!e.allDay && <span>until {timeOf(e.end)}</span>}
                            {e.location && (
                              <span className="inline-flex min-w-0 items-center gap-0.5 truncate">
                                <MapPin size={10} /> {e.location}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {e.link && (
                        <a href={e.link} target="_blank" rel="noreferrer" className="mt-1 shrink-0 text-ink-faint hover:text-ink" title="Open">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {manage && (
        <Modal title="My calendars" subtitle="Only you can see these. Teammates connect their own." onClose={() => setManage(false)}>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {feed?.connections.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color ?? "var(--color-accent)" }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.label}</span>
                  <span className="block text-xs text-ink-faint">{c.provider === "google" ? "Google Calendar" : "iCal feed"}{c.error ? ` · ${c.error}` : ""}</span>
                </span>
                <RemoveButton id={c.id} label={c.label} onDone={() => load(true)} />
              </li>
            ))}
            {!feed?.connections.length && <li className="px-3 py-4 text-center text-sm text-ink-faint">No calendars connected.</li>}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {googleEnabled && (
              <a href={`/api/calendar/google?back=${encodeURIComponent(pathname)}`} className="btn btn-primary btn-sm">
                <Plus size={13} /> Google Calendar
              </a>
            )}
            <button onClick={() => (setManage(false), setAddFeed(true))} className="btn btn-secondary btn-sm">
              <Plus size={13} /> Calendar feed (iCal)
            </button>
          </div>
        </Modal>
      )}
      {addFeed && <AddFeedDialog onClose={() => setAddFeed(false)} onAdded={() => (setAddFeed(false), load(true))} />}
    </div>
  );
}

function RemoveButton({ id, label, onDone }: { id: string; label: string; onDone: () => void }) {
  const [busy, start] = useTransition();
  const toast = useToast();
  return (
    <button
      disabled={busy}
      onClick={() => {
        if (!confirm(`Disconnect "${label}"? Orbit forgets its access; nothing changes in the calendar itself.`)) return;
        start(async () => {
          const r = await removeCalendarAction(id);
          toast(r.ok ? "Disconnected." : r.error, r.ok);
          onDone();
        });
      }}
      className="tap-icon rounded-lg p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"
      aria-label={`Disconnect ${label}`}
    >
      <Trash2 size={14} />
    </button>
  );
}

function AddFeedDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const toast = useToast();
  return (
    <Modal title="Add a calendar feed" subtitle="Works with Outlook, Apple iCloud, Google and anything that publishes an iCal (.ics) link." onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addIcalFeedAction(url, label);
            if (!r.ok) return setError(r.error);
            toast("Calendar feed added.");
            onAdded();
          });
        }}
      >
        <label className="block text-sm">
          <span className="text-xs text-ink-faint">Feed address</span>
          <input autoFocus required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… or webcal://…" className="field mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-ink-faint">Name (optional)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Work calendar" className="field mt-1" />
        </label>
        <details className="rounded-lg border border-line px-3 py-2 text-xs text-ink-soft">
          <summary className="cursor-pointer font-medium text-ink">Where do I find the link?</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li><strong>Outlook / Microsoft 365:</strong> Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.</li>
            <li><strong>Google:</strong> calendar settings → Integrate calendar → “Secret address in iCal format”.</li>
            <li><strong>Apple iCloud:</strong> on icloud.com, share the calendar publicly and copy the webcal link.</li>
          </ul>
        </details>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button disabled={busy || !url.trim()} className="btn btn-primary">
            {busy ? "Checking…" : "Add feed"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
