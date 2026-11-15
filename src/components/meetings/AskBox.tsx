"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { askMeetingsAction } from "@/app/actions";
import { fmtDay } from "./shared";

const SUGGESTIONS = ["Which action items are still open, oldest first?", "What did we decide about invoices and payments?", "What came up more than once that we never finished?"];

type Answer = { answer: string; cited: { tag: number; id: string; series: string; at: string }[]; searched: number; total: number };

/** Ask a question across your meetings; the answer cites the meetings it used. */
export function AskBox({ slug, enabled, isAdmin }: { slug: string; enabled: boolean; isAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Answer | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const ask = (question: string) =>
    start(async () => {
      setErr(null);
      const r = await askMeetingsAction(slug, question);
      if (!r.ok) {
        setErr(r.error);
        setRes(null);
      } else setRes(r);
    });

  if (!enabled)
    return isAdmin ? (
      <div className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">
        <div className="flex items-center gap-1.5 font-medium text-ink"><Sparkles size={15} className="text-accent" /> Ask your meetings</div>
        <p className="mt-1">Ask questions like &ldquo;what action items are still open?&rdquo; across all your notes. To turn it on, add a variable named <code className="rounded bg-paper px-1">ANTHROPIC_API_KEY</code> to the Orbit service in Railway, with a key from console.anthropic.com.</p>
      </div>
    ) : null;

  // Turn [#3] tags into links to the meeting they point at.
  const byTag = new Map(res?.cited.map((c) => [c.tag, c]) ?? []);
  const parts = res ? res.answer.split(/(\[#\d+\])/g) : [];

  return (
    <div className="card p-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 3) ask(q.trim());
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Sparkles size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your meetings…" maxLength={1000} className="field pl-9" aria-label="Ask a question about your meetings" />
        </div>
        <button disabled={busy || q.trim().length < 3} className="btn btn-primary shrink-0">
          {busy ? <Loader2 size={15} className="animate-spin" /> : "Ask"}
        </button>
      </form>
      {!res && !busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => (setQ(s), ask(s))} className="rounded-full border border-line px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-hover hover:text-ink">
              {s}
            </button>
          ))}
        </div>
      )}
      {busy && <p className="mt-3 text-sm text-ink-soft">Reading your meeting notes…</p>}
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      {res && !busy && (
        <div className="mt-4 space-y-3">
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
            {parts.map((p, i) => {
              const m = p.match(/^\[#(\d+)\]$/);
              const c = m ? byTag.get(Number(m[1])) : null;
              if (m && c)
                return (
                  <Link key={i} href={`/w/${slug}/meetings/${c.id}`} className="mx-0.5 rounded bg-accent-soft px-1 text-xs font-medium text-accent" title={`${c.series}, ${fmtDay(c.at)}`}>
                    {fmtDay(c.at).replace(/^\w+, /, "")}
                  </Link>
                );
              return m ? null : <span key={i}>{p}</span>;
            })}
          </div>
          {res.cited.length > 0 && (
            <div className="border-t border-line pt-2">
              <div className="eyebrow mb-1">From these meetings</div>
              <ul className="space-y-0.5 text-sm">
                {res.cited.map((c) => (
                  <li key={c.id}>
                    <Link href={`/w/${slug}/meetings/${c.id}`} className="text-accent hover:underline">{c.series}</Link> <span className="text-ink-faint">· {fmtDay(c.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-ink-faint">
            AI answer from Gemini&apos;s notes{res.searched < res.total ? ` (searched the newest ${res.searched} of ${res.total} meetings)` : ""}. Check the meeting before acting on anything important.
          </p>
          <button onClick={() => (setRes(null), setQ(""))} className="text-xs text-accent">Ask something else</button>
        </div>
      )}
    </div>
  );
}
