"use client";

import { useAct } from "@/components/ui/Toast";
import { useState, useTransition } from "react";
import { ClipboardCheck, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { markReviewedAction, updateDocInfoAction } from "@/app/actions";
import type { DocStatus, ReviewCycle } from "@/db/schema";
import { fmtDate, nextReviewOn, REVIEW_CYCLE_LABELS, REVIEW_LABELS, reviewState } from "@/lib/recurrence";

export type DocInfoData = {
  docType: string | null;
  area: string | null;
  audience: string[];
  docStatus: DocStatus | null;
  ownerId: string | null;
  reviewCycle: ReviewCycle | null;
  lastReviewedOn: string | null;
  lastReviewedBy: string | null;
  sourceLink: string | null;
  sensitive: boolean;
  docVersion: string | null;
};
type Member = { id: string; name: string };

const STATUS: Record<DocStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-ok-soft text-ok" },
  needs_review: { label: "Needs review", cls: "bg-warn-soft text-warn" },
  draft: { label: "Draft", cls: "bg-hover text-ink-soft" },
  outdated: { label: "Outdated", cls: "bg-danger-soft text-danger" },
  archived: { label: "Archived", cls: "bg-hover text-ink-faint" },
};
const TONE: Record<string, string> = { danger: "bg-danger-soft text-danger", warn: "bg-warn-soft text-warn", accent: "bg-accent-soft text-accent", muted: "bg-hover text-ink-faint", ok: "bg-ok-soft text-ok" };

export function DocInfo({ slug, pageId, initial, members, options, canEdit, forceOpen, onClose }: { slug: string; pageId: string; initial: DocInfoData; members: Member[]; options: { types: readonly string[]; areas: readonly string[]; audiences: readonly string[] }; canEdit: boolean; forceOpen?: boolean; onClose?: () => void }) {
  const [v, setV] = useState(initial);
  const [open, setOpen] = useState(Boolean(forceOpen));
  const [, start] = useTransition();
  const [, act] = useAct();
  const isDoc = Boolean(v.docType || v.docStatus || v.reviewCycle);
  const state = reviewState(v.reviewCycle, v.lastReviewedOn);
  const next = nextReviewOn(v.reviewCycle, v.lastReviewedOn);

  const save = (patch: Partial<DocInfoData>) => {
    setV((x) => ({ ...x, ...patch }));
    const { lastReviewedBy, ...rest } = patch; // not a server field
    void lastReviewedBy;
    act(() => updateDocInfoAction(slug, pageId, rest));
  };
  const review = () =>
    start(async () => {
      const today = await markReviewedAction(slug, pageId);
      setV((x) => ({ ...x, lastReviewedOn: today, docStatus: x.docStatus === "needs_review" || !x.docStatus ? "active" : x.docStatus }));
    });

  if (!isDoc && !open) return null; // the "Set up as document" entry lives in the ••• menu

  const field = "rounded-md border border-line bg-paper px-2 py-1 text-sm";
  return (
    <div className="mb-6 rounded-xl border border-line bg-card/60 text-sm">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 md:px-4">
        {v.docStatus && <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS[v.docStatus].cls}`}>{STATUS[v.docStatus].label}</span>}
        {v.docType && <span className="text-ink-soft">{v.docType}</span>}
        {v.area && <span className="text-ink-faint">· {v.area}</span>}
        {v.reviewCycle && (
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${TONE[REVIEW_LABELS[state].tone]}`} title={next ? `Next review ${fmtDate(next)}` : ""}>
            {REVIEW_LABELS[state].label}
            {next && state !== "first" ? ` · ${fmtDate(next)}` : ""}
          </span>
        )}
        {v.lastReviewedOn && (
          <span className="text-xs text-ink-faint">
            Reviewed {fmtDate(v.lastReviewedOn)}
            {v.lastReviewedBy ? ` by ${v.lastReviewedBy}` : ""}
          </span>
        )}
        {v.sourceLink && (
          <a href={v.sourceLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-accent hover:underline">
            Original <ExternalLink size={11} />
          </a>
        )}
        <span className="ml-auto flex items-center gap-1">
          {canEdit && (
            <button onClick={review} className="flex items-center gap-1 btn btn-secondary btn-sm" title="Stamp today as the review date">
              <ClipboardCheck size={13} /> Mark reviewed
            </button>
          )}
          {canEdit && (
            <button onClick={() => (setOpen((o) => !o), open && onClose?.())} className="rounded-md p-1 text-ink-faint hover:bg-hover hover:text-ink" aria-label="Edit document info">
              {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </span>
      </div>

      {open && canEdit && (
        <div className="grid grid-cols-1 gap-3 border-t border-line px-4 py-3 sm:grid-cols-2 md:grid-cols-3">
          <L label="Type">
            <select value={v.docType ?? ""} onChange={(e) => save({ docType: e.target.value || null })} className={field}>
              <option value="">—</option>
              {options.types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </L>
          <L label="Status">
            <select value={v.docStatus ?? ""} onChange={(e) => save({ docStatus: (e.target.value || null) as DocStatus | null })} className={field}>
              <option value="">—</option>
              {(Object.keys(STATUS) as DocStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS[s].label}
                </option>
              ))}
            </select>
          </L>
          <L label="Area">
            <select value={v.area ?? ""} onChange={(e) => save({ area: e.target.value || null })} className={field}>
              <option value="">—</option>
              {options.areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </L>
          <L label="Owner">
            <select value={v.ownerId ?? ""} onChange={(e) => save({ ownerId: e.target.value || null })} className={field}>
              <option value="">Nobody yet</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </L>
          <L label="Review every">
            <select value={v.reviewCycle ?? ""} onChange={(e) => save({ reviewCycle: (e.target.value || null) as ReviewCycle | null })} className={field}>
              <option value="">Not set</option>
              {(Object.keys(REVIEW_CYCLE_LABELS) as ReviewCycle[]).map((c) => (
                <option key={c} value={c}>
                  {REVIEW_CYCLE_LABELS[c]}
                </option>
              ))}
            </select>
          </L>
          <L label="Last reviewed">
            <input type="date" value={v.lastReviewedOn ?? ""} onChange={(e) => save({ lastReviewedOn: e.target.value || null })} className={field} />
          </L>
          <L label="Audience">
            <div className="flex flex-wrap gap-1">
              {options.audiences.map((a) => {
                const on = v.audience.includes(a);
                return (
                  <button key={a} onClick={() => save({ audience: on ? v.audience.filter((x) => x !== a) : [...v.audience, a] })} className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft"}`}>
                    {a}
                  </button>
                );
              })}
            </div>
          </L>
          <L label="Version label">
            <input value={v.docVersion ?? ""} onChange={(e) => setV({ ...v, docVersion: e.target.value })} onBlur={(e) => save({ docVersion: e.target.value || null })} placeholder="e.g. v2.1" className={field} />
          </L>
          <L label="Original lives at">
            <input value={v.sourceLink ?? ""} onChange={(e) => setV({ ...v, sourceLink: e.target.value })} onBlur={(e) => save({ sourceLink: e.target.value || null })} placeholder="Drive link (optional)" className={field} />
          </L>
          <label className="flex items-center gap-2 text-xs text-ink-soft md:col-span-3">
            <input type="checkbox" checked={v.sensitive} onChange={(e) => save({ sensitive: e.target.checked })} /> Sensitive: keep the real document in Drive, this page is only a pointer
          </label>
        </div>
      )}
    </div>
  );
}

const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1 block text-xs text-ink-faint">{label}</span>
    {children}
  </label>
);
