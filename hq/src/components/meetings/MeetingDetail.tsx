"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ExternalLink, FileText, Trash2, Gavel, ListChecks, MessagesSquare, Sparkles, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteAddedMeetingAction } from "@/app/actions";
import { useToast } from "@/components/ui/Toast";
import { StepRow, fmtLong, type MeetingView, type StepPerson } from "./shared";

/** One meeting: the overview, decisions and next steps up top; topic details folded below. */
export function MeetingDetail({ slug, m, canMakeTasks, isAdmin, team, suggest }: { isAdmin?: boolean; slug: string; m: MeetingView; canMakeTasks: boolean; team?: StepPerson[]; suggest?: Record<string, string> }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [showText, setShowText] = useState(false);
  const toast = useToast();
  const [openTopics, setOpenTopics] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setOpenTopics((s) => (s.has(i) ? (s.delete(i), new Set(s)) : new Set(s.add(i))));
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <button onClick={() => (history.length > 1 ? router.back() : router.push(`/w/${slug}/meetings`))} className="flex min-h-10 items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ChevronLeft size={16} /> Meetings
      </button>
      <header>
        <h1 className="page-title">{m.series}</h1>
        <p className="mt-1 text-sm text-ink-soft">{fmtLong(m.at)}</p>
        {m.attendees.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <Users size={13} className="text-ink-faint" />
            {m.attendees.map((a) => (
              <span key={a} className="rounded-full border border-line px-2 py-0.5">{a}</span>
            ))}
          </div>
        )}
        {m.docUrl ? (
          <a href={m.docUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm mt-4">
            <ExternalLink size={14} /> Full notes and transcript in Google Docs
          </a>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">{m.platform ?? "Added by hand"}</span>
            {m.transcript && (
              <button onClick={() => setShowText((o) => !o)} className="btn btn-sm">
                <FileText size={14} /> {showText ? "Hide" : "Show"} the full text
              </button>
            )}
            {isAdmin && (
              <button
                disabled={busy}
                onClick={() =>
                  confirm("Remove this meeting from Orbit? Tasks already made from it stay.") &&
                  start(async () => {
                    const r = await deleteAddedMeetingAction(slug, m.id);
                    if (!r.ok) return toast(r.error, false);
                    router.push(`/w/${slug}/meetings`);
                    router.refresh();
                  })
                }
                className="btn btn-ghost btn-sm text-danger"
              >
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>
        )}
        {showText && m.transcript && <pre className="card mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed text-ink-soft">{m.transcript}</pre>}
      </header>

      {!m.recognised && m.docUrl && <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Orbit couldn&apos;t find Gemini&apos;s usual sections in this doc. Open it in Google Docs to read it.</p>}

      {(m.summary || m.points.length > 0) && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Sparkles size={14} className="text-accent" /> Summary</h2>
          <div className="card space-y-3 p-4 text-sm leading-relaxed">
            {m.summary && <p className="font-medium">{m.summary}</p>}
            {m.points.map((p) => (
              <div key={p.title}>
                <div className="font-medium">{p.title}</div>
                <p className="text-ink-soft">{p.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {m.nextSteps.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ListChecks size={14} className="text-accent" /> Next steps <span className="font-normal text-ink-faint">{m.nextSteps.length}</span></h2>
          <ul className="card divide-y divide-line">
            {m.nextSteps.map((s, i) => (
              <StepRow key={i} slug={slug} meetingId={m.id} index={i} step={s} status={m.status[i]} meetingAt={m.at} canMakeTasks={canMakeTasks} team={team} suggestedId={s.owner ? suggest?.[s.owner.trim().toLowerCase().replace(/\s+/g, " ")] ?? null : null} />
            ))}
          </ul>
        </section>
      )}

      {m.decisions.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Gavel size={14} className="text-accent" /> Decisions</h2>
          <ul className="card divide-y divide-line">
            {m.decisions.map((d, i) => (
              <li key={i} className="px-4 py-3 text-sm">
                <div className="font-medium">{d.title}</div>
                {d.text && <p className="mt-0.5 text-ink-soft">{d.text}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {m.topics.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><MessagesSquare size={14} className="text-accent" /> What was discussed</h2>
          <ul className="card divide-y divide-line">
            {m.topics.map((t, i) => (
              <li key={i}>
                <button onClick={() => toggle(i)} className="flex min-h-12 w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium" aria-expanded={openTopics.has(i)}>
                  <span className="flex-1">{t.title}</span>
                  <ChevronDown size={15} className={`shrink-0 text-ink-faint transition ${openTopics.has(i) ? "rotate-180" : ""}`} />
                </button>
                {openTopics.has(i) && <p className="px-4 pb-3 text-sm leading-relaxed text-ink-soft">{t.text}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
