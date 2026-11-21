"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Check, CheckSquare, ExternalLink, FileQuestion, Link2, Loader2, MessagesSquare, Sparkles } from "lucide-react";
import { getAnswerAction, markQuestionHandledAction } from "@/app/answer-actions";
import { useToast } from "@/components/ui/Toast";

type Source = { key: string; tag: number; kind: "page" | "meeting" | "task" | "link"; title: string; href: string; external?: boolean; note?: string };
type Result = { mode: "ai" | "matches"; covered: boolean; answer: string; sources: Source[]; question: string };
type Unanswered = { id: string; question: string; times: number; lastAt: string; askers: string[] };

const EXAMPLES = ["What do we do when a client cancels?", "How do I handle a customer complaint?", "Who do I tell if I need a day off?"];
const ICON = { page: BookOpen, meeting: MessagesSquare, task: CheckSquare, link: Link2 } as const;

function SourceLink({ s, children, className }: { s: Source; children: React.ReactNode; className?: string }) {
  return s.external ? (
    <a href={s.href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
  ) : (
    <Link href={s.href} className={className}>{children}</Link>
  );
}

export function GetAnswer({ slug, aiEnabled, isAdmin, unanswered }: { slug: string; aiEnabled: boolean; isAdmin: boolean; unanswered: Unanswered[] }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const ask = (question: string) =>
    start(async () => {
      setErr(null);
      setRes(null);
      const r = await getAnswerAction(slug, question);
      if (!r.ok) return setErr(r.error);
      setRes({ ...r, question });
      if (!r.covered && isAdmin) router.refresh();
    });

  const byTag = new Map(res?.sources.map((s) => [s.tag, s]) ?? []);
  const parts = res?.answer ? res.answer.split(/(\[#\d+\])/g) : [];

  return (
    <div className="space-y-6">
      <div className="card p-4 md:p-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim().length >= 3) ask(q.trim());
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Sparkles size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What do you need to know?" maxLength={600} autoFocus className="field py-3 pl-10 text-base" aria-label="Your question" />
          </div>
          <button disabled={busy || q.trim().length < 3} className="btn btn-primary shrink-0 px-5">
            {busy ? <Loader2 size={16} className="animate-spin" /> : "Ask"}
          </button>
        </form>

        {!res && !busy && !err && (
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((s) => (
              <button key={s} onClick={() => (setQ(s), ask(s))} className="rounded-full border border-line px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-hover hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        )}
        {busy && <p className="mt-4 text-sm text-ink-soft">Reading our SOPs, documents and notes…</p>}
        {err && <p className="mt-4 text-sm text-danger">{err}</p>}

        {res && !busy && (
          <div className="mt-5 space-y-4">
            <div className="text-xs text-ink-faint">You asked: {res.question}</div>

            {res.mode === "ai" && res.covered && (
              <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
                {parts.map((p, i) => {
                  const m = p.match(/^\[#(\d+)\]$/);
                  const s = m ? byTag.get(Number(m[1])) : null;
                  if (m && s)
                    return (
                      <SourceLink key={i} s={s} className="mx-0.5 rounded bg-accent-soft px-1.5 align-baseline text-xs font-semibold text-accent">
                        <span title={s.title}>{s.tag}</span>
                      </SourceLink>
                    );
                  return m ? null : <span key={i}>{p}</span>;
                })}
              </div>
            )}

            {!res.covered && (
              <div className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm">
                <FileQuestion size={18} className="mt-0.5 shrink-0 text-warn" />
                <div>
                  <div className="font-medium">We don&apos;t have a published answer for that yet.</div>
                  <p className="mt-0.5 text-ink-soft">{res.answer || "Nothing in our published material matches."} Your question has been sent to the owners so the missing SOP can be written. Until then, ask your manager.</p>
                </div>
              </div>
            )}

            {res.mode === "matches" && res.covered && <p className="text-sm text-ink-soft">Written answers aren&apos;t turned on yet, so here are the closest matches in our material.</p>}

            {res.sources.length > 0 && (
              <div className="border-t border-line pt-3">
                <div className="eyebrow mb-1.5">{res.mode === "ai" ? "Sources" : "Closest matches"}</div>
                <ul className="space-y-1.5">
                  {res.sources.map((s) => {
                    const Icon = ICON[s.kind];
                    return (
                      <li key={s.key}>
                        <SourceLink s={s} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-hover">
                          {res.mode === "ai" ? <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-soft text-[11px] font-semibold text-accent">{s.tag}</span> : <Icon size={15} className="mt-0.5 shrink-0 text-ink-faint" />}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-medium text-accent">
                              <span className="truncate">{s.title}</span>
                              {s.external && <ExternalLink size={11} className="shrink-0" />}
                            </span>
                            {s.note && <span className="block text-xs text-ink-faint">{s.note}</span>}
                          </span>
                        </SourceLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {res.mode === "ai" && res.covered && <p className="text-[11px] text-ink-faint">Written by AI from our published material. Open the source before acting on anything important.</p>}
            <button onClick={() => (setRes(null), setQ(""))} className="text-xs text-accent">Ask something else</button>
          </div>
        )}
      </div>

      {!aiEnabled && isAdmin && (
        <div className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">
          <div className="font-medium text-ink">Written answers are off</div>
          <p className="mt-1">Right now this page only lists the closest matches. To get written answers, add a variable named <code className="rounded bg-paper px-1">ANTHROPIC_API_KEY</code> to the Orbit service in Railway, with a key from console.anthropic.com.</p>
        </div>
      )}

      {isAdmin && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <FileQuestion size={15} className="text-accent" /> Questions we couldn&apos;t answer {unanswered.length > 0 && <span className="rounded-full bg-warn-soft px-1.5 text-[11px] text-warn">{unanswered.length}</span>}
          </h2>
          <p className="mb-2 text-xs text-ink-faint">Only owners and admins see this. Each one is a gap in the published SOPs. Answers only use pages and documents whose status is Active, so a draft that covers it won&apos;t count until it&apos;s published.</p>
          {unanswered.length ? (
            <ul className="card divide-y divide-line">
              {unanswered.map((u) => (
                <li key={u.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{u.question}</div>
                    <div className="mt-0.5 text-xs text-ink-faint">
                      {u.times > 1 ? `Asked ${u.times} times` : "Asked once"} · {u.askers.join(", ")} · last {new Date(u.lastAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      start(async () => {
                        const r = await markQuestionHandledAction(slug, u.id);
                        toast(r.ok ? "Marked handled." : r.error, r.ok);
                        router.refresh();
                      })
                    }
                    disabled={busy}
                    className="btn btn-sm shrink-0"
                    title="You wrote the SOP, or decided it isn't needed"
                  >
                    <Check size={14} /> Handled
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card px-4 py-6 text-center text-sm text-ink-faint">Nothing waiting. Every question so far had an answer.</p>
          )}
        </section>
      )}
    </div>
  );
}
