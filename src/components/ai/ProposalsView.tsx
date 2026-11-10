"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { approveProposalAction, rejectProposalAction } from "@/app/actions";

export type Proposal = {
  id: string;
  tool: string;
  pageId: string | null;
  pageTitle: string | null;
  pageIcon: string | null;
  currentText: string | null;
  title: string | null;
  markdown: string;
  isSop: boolean;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  grantName: string | null;
  createdAt: string;
};

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const LABEL: Record<string, string> = { create_page: "wants to create a page", update_page: "wants to rewrite", append_to_page: "wants to add to" };

/** A cheap line-level diff: shows removed lines in red and added lines in green. */
function diffLines(before: string, after: string) {
  const a = before.split("\n");
  const b = after.split("\n");
  const setA = new Set(a);
  const setB = new Set(b);
  const out: { t: "same" | "add" | "del"; s: string }[] = [];
  for (const line of a) if (!setB.has(line)) out.push({ t: "del", s: line });
  for (const line of b) out.push({ t: setA.has(line) ? "same" : "add", s: line });
  return out;
}

export function ProposalsView({ slug, items, canReview }: { slug: string; items: Proposal[]; canReview: boolean }) {
  const [busy, start] = useTransition();
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  const [note, setNote] = useState("");
  const pending = items.filter((p) => p.status === "pending");
  const past = items.filter((p) => p.status !== "pending");

  const Card = ({ p }: { p: Proposal }) => {
    const isOpen = open === p.id;
    const diff = p.tool === "update_page" && p.currentText ? diffLines(p.currentText, p.markdown) : null;
    return (
      <li className="rounded-xl border border-line bg-card">
        <button onClick={() => setOpen(isOpen ? null : p.id)} className="flex w-full items-start gap-3 p-4 text-left">
          <div className="min-w-0 flex-1">
            <div className="text-sm">
              <span className="font-medium">{p.grantName ?? "AI"}</span> {LABEL[p.tool] ?? p.tool}{" "}
              {p.pageId ? (
                <Link href={`/w/${slug}/p/${p.pageId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-accent hover:underline">
                  {p.pageIcon ?? "📄"} {p.pageTitle || "Untitled"}
                </Link>
              ) : (
                <span className="font-medium">&quot;{p.title}&quot;</span>
              )}
              {p.isSop && <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-semibold text-warn">SOP</span>}
            </div>
            <div className="mt-1 text-sm text-ink-soft">Why: {p.reason}</div>
            <div className="mt-1 text-xs text-ink-faint">
              {fmt(p.createdAt)}
              {p.status !== "pending" && (
                <>
                  {" · "}
                  <span className={p.status === "approved" ? "text-ok" : "text-danger"}>{p.status}</span> by {p.reviewerName ?? "?"} {p.reviewedAt ? fmt(p.reviewedAt) : ""}
                  {p.reviewNote ? ` · "${p.reviewNote}"` : ""}
                </>
              )}
            </div>
          </div>
          {isOpen ? <ChevronUp size={16} className="mt-1 shrink-0 text-ink-faint" /> : <ChevronDown size={16} className="mt-1 shrink-0 text-ink-faint" />}
        </button>
        {isOpen && (
          <div className="border-t border-line px-4 py-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">{diff ? "What would change" : "Proposed content"}</div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-3 text-xs leading-relaxed">
              {diff
                ? diff.map((l, i) => (
                    <div key={i} className={l.t === "add" ? "bg-ok-soft text-ok" : l.t === "del" ? "bg-danger-soft text-danger line-through" : "text-ink-soft"}>
                      {l.t === "add" ? "+ " : l.t === "del" ? "− " : "  "}
                      {l.s || " "}
                    </div>
                  ))
                : p.markdown}
            </pre>
            {canReview && p.status === "pending" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="min-w-40 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
                <button disabled={busy} onClick={() => start(async () => (await rejectProposalAction(slug, p.id, note || undefined), setNote("")))} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm hover:bg-danger-soft hover:text-danger">
                  <X size={14} /> Reject
                </button>
                <button disabled={busy} onClick={() => start(async () => (await approveProposalAction(slug, p.id, note || undefined), setNote("")))} className="flex items-center gap-1 btn btn-primary">
                  <Check size={14} /> Approve &amp; apply
                </button>
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Waiting for approval ({pending.length})</h2>
        <ul className="mt-2 space-y-2">
          {pending.length === 0 && <li className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-faint">Nothing waiting. AI edits to SOPs and documents will show up here.</li>}
          {pending.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </ul>
      </section>
      {past.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Reviewed</h2>
          <ul className="mt-2 space-y-2">
            {past.slice(0, 20).map((p) => (
              <Card key={p.id} p={p} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
