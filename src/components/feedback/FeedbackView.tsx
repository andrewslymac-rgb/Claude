"use client";

import { useMemo, useState, useTransition } from "react";
import { Bug, Lightbulb, HelpCircle, Trash2, MessageSquareReply } from "lucide-react";
import { createFeedbackAction, deleteFeedbackAction, updateFeedbackAction } from "@/app/actions";
import type { FeedbackKind, FeedbackStatus } from "@/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";

type Item = { id: string; kind: FeedbackKind; body: string; pagePath: string | null; status: FeedbackStatus; response: string | null; createdAt: string; userId: string | null; by: string | null };

const KINDS: Record<FeedbackKind, { label: string; icon: React.ReactNode; tone: string; prompt: string }> = {
  bug: { label: "Something's broken", icon: <Bug size={15} />, tone: "bg-danger-soft text-danger", prompt: "What happened, and what did you expect? Which screen were you on?" },
  idea: { label: "Idea or upgrade", icon: <Lightbulb size={15} />, tone: "bg-accent-soft text-accent", prompt: "What would make Orbit better for you?" },
  question: { label: "Question", icon: <HelpCircle size={15} />, tone: "bg-warn-soft text-warn", prompt: "What are you trying to do?" },
};
const STATUS: Record<FeedbackStatus, { label: string; tone: string }> = {
  new: { label: "New", tone: "bg-accent-soft text-accent" },
  planned: { label: "Planned", tone: "bg-warn-soft text-warn" },
  in_progress: { label: "In progress", tone: "bg-warn-soft text-warn" },
  done: { label: "Done", tone: "bg-ok-soft text-ok" },
  wont_do: { label: "Won't do", tone: "bg-hover text-ink-faint" },
};
const OPEN: FeedbackStatus[] = ["new", "planned", "in_progress"];

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

/** A simple running list of bug reports, ideas and questions about Orbit. */
export function FeedbackView({ slug, me, canManage, fromPath, items }: { slug: string; me: string; canManage: boolean; fromPath: string | null; items: Item[] }) {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<"open" | "all" | FeedbackKind>("open");
  const [replying, setReplying] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, start] = useTransition();

  const shown = useMemo(() => items.filter((i) => (filter === "open" ? OPEN.includes(i.status) : filter === "all" ? true : i.kind === filter)), [items, filter]);
  const counts = { open: items.filter((i) => OPEN.includes(i.status)).length, bug: items.filter((i) => i.kind === "bug").length, idea: items.filter((i) => i.kind === "idea").length, question: items.filter((i) => i.kind === "question").length };

  return (
    <div className="page-narrow">
      <PageHeader eyebrow="Help us improve" title="Feedback" subtitle="Report something broken, suggest an upgrade, or ask a question. Everyone in the company can add to this list and see where things stand." />

      <form
        className="card mt-6 p-4 md:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createFeedbackAction(slug, { kind, body, pagePath: fromPath });
            setMsg(r.ok ? { ok: true, text: r.message ?? "Thanks." } : { ok: false, text: r.error });
            if (r.ok) setBody("");
          });
        }}
      >
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {(Object.keys(KINDS) as FeedbackKind[]).map((k) => (
            <button type="button" key={k} onClick={() => setKind(k)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${kind === k ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-soft hover:bg-hover"}`}>
              {KINDS[k].icon} {KINDS[k].label}
            </button>
          ))}
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder={KINDS[kind].prompt} className="field mt-3" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-faint">{fromPath ? `We'll note you came from ${fromPath.replace(`/w/${slug}`, "") || "Home"}.` : "Your name is attached so we can follow up."}</span>
          <button disabled={busy || !body.trim()} className="btn btn-primary">
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
        {msg && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
      </form>

      <div className="mt-8 flex flex-wrap items-center gap-1 border-b border-line pb-2 text-sm">
        {(
          [
            ["open", `Open (${counts.open})`],
            ["bug", `Bugs (${counts.bug})`],
            ["idea", `Ideas (${counts.idea})`],
            ["question", `Questions (${counts.question})`],
            ["all", `All (${items.length})`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-3 py-1.5 ${filter === k ? "bg-hover font-medium text-ink" : "text-ink-soft hover:bg-hover"}`}>
            {label}
          </button>
        ))}
      </div>

      <ul className="mt-3 space-y-2">
        {shown.length === 0 && <li className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-faint">Nothing here yet.</li>}
        {shown.map((i) => (
          <li key={i.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${KINDS[i.kind].tone}`}>
                {KINDS[i.kind].icon} {KINDS[i.kind].label}
              </span>
              {canManage ? (
                <select value={i.status} disabled={busy} onChange={(e) => start(async () => void (await updateFeedbackAction(slug, i.id, { status: e.target.value })))} className="field w-auto px-2 py-1 text-xs">
                  {(Object.keys(STATUS) as FeedbackStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS[s].label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`badge ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</span>
              )}
              <span className="ml-auto text-xs text-ink-faint">
                {i.by ?? "Someone"}
                {i.userId === me ? " (you)" : ""} · {when(i.createdAt)}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{i.body}</p>
            {i.pagePath && <p className="mt-1 text-xs text-ink-faint">From: {i.pagePath.replace(`/w/${slug}`, "") || "Home"}</p>}
            {i.response && (
              <div className="mt-3 rounded-lg border-l-2 border-accent bg-side/60 px-3 py-2 text-sm">
                <div className="eyebrow mb-0.5">Response</div>
                <div className="whitespace-pre-wrap">{i.response}</div>
              </div>
            )}
            {canManage && (
              <div className="mt-2 flex gap-1">
                <button onClick={() => (setReplying(replying === i.id ? null : i.id), setReply(i.response ?? ""))} className="btn btn-ghost btn-sm">
                  <MessageSquareReply size={13} /> {i.response ? "Edit response" : "Respond"}
                </button>
                <button disabled={busy} onClick={() => confirm("Delete this entry?") && start(async () => void (await deleteFeedbackAction(slug, i.id)))} className="btn btn-danger btn-sm">
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            )}
            {replying === i.id && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  start(async () => {
                    await updateFeedbackAction(slug, i.id, { response: reply.trim() || null });
                    setReplying(null);
                  });
                }}
              >
                <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply they'll see on this entry" className="field" />
                <button disabled={busy} className="btn btn-primary btn-sm">
                  Save
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
