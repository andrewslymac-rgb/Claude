"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { DocStatus, ReviewCycle } from "@/db/schema";
import { fmtDate, nextReviewOn, REVIEW_LABELS, reviewState, type ReviewState } from "@/lib/recurrence";

export type Doc = {
  id: string;
  title: string;
  icon: string | null;
  docType: string | null;
  area: string | null;
  audience: string[];
  docStatus: DocStatus | null;
  ownerName: string | null;
  reviewCycle: ReviewCycle | null;
  lastReviewedOn: string | null;
  sourceLink: string | null;
  source: string;
  isSop: boolean;
  updatedAt: string;
  driveConnectionId: string | null;
};
export type CollectionOpt = { id: string; label: string; icon: string };
type LogEntry = { id: string; pageId: string; pageTitle: string; pageIcon: string | null; version: number; note: string | null; why: string | null; teamTold: boolean; actorType: string; actorName: string | null; createdAt: string };

export const STATUS_LABELS: Record<DocStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-ok-soft text-ok" },
  needs_review: { label: "Needs review", cls: "bg-warn-soft text-warn" },
  draft: { label: "Draft", cls: "bg-hover text-ink-soft" },
  outdated: { label: "Outdated", cls: "bg-danger-soft text-danger" },
  archived: { label: "Archived", cls: "bg-hover text-ink-faint" },
};
const TONE: Record<string, string> = { danger: "text-danger", warn: "text-warn", accent: "text-accent", muted: "text-ink-faint", ok: "text-ok" };

export function LibraryView({ slug, docs, log, types, areas, collections }: { slug: string; docs: Doc[]; log: LogEntry[]; types: readonly string[]; areas: readonly string[]; collections: CollectionOpt[] }) {
  const [tab, setTab] = useState<"docs" | "log">("docs");
  const [q, setQ] = useState("");
  const [coll, setColl] = useState("");
  const [type, setType] = useState("");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const [review, setReview] = useState<ReviewState | "">("");

  const rows = useMemo(
    () =>
      docs
        .map((d) => ({ ...d, review: reviewState(d.reviewCycle, d.lastReviewedOn), next: nextReviewOn(d.reviewCycle, d.lastReviewedOn) }))
        .filter(
          (d) =>
            (!q || d.title.toLowerCase().includes(q.toLowerCase())) &&
            (!coll || (coll === "orbit" ? !d.driveConnectionId : d.driveConnectionId === coll)) &&
            (!type || d.docType === type) &&
            (!area || d.area === area) &&
            (!status || d.docStatus === status) &&
            (!review || d.review === review),
        ),
    [docs, q, coll, type, area, status, review],
  );
  const dueCount = docs.filter((d) => ["first", "overdue", "due_soon"].includes(reviewState(d.reviewCycle, d.lastReviewedOn))).length;

  const sel = "rounded-md border border-line bg-card px-2 py-1.5 text-sm";
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Document Library</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {docs.length} documents · {dueCount > 0 ? <span className="text-warn">{dueCount} need a review</span> : "all reviews current"}
          </p>
        </div>
        <div className="flex rounded-lg border border-line p-0.5 text-sm">
          <button onClick={() => setTab("docs")} className={`rounded-md px-3 py-1 ${tab === "docs" ? "bg-hover" : "text-ink-soft"}`}>
            Documents
          </button>
          <button onClick={() => setTab("log")} className={`rounded-md px-3 py-1 ${tab === "log" ? "bg-hover" : "text-ink-soft"}`}>
            Change log
          </button>
        </div>
      </div>

      {tab === "docs" ? (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className={`${sel} min-w-40 flex-1`} />
            {collections.length > 0 && (
              <select value={coll} onChange={(e) => setColl(e.target.value)} className={sel}>
                <option value="">All document areas</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.label}
                  </option>
                ))}
                <option value="orbit">Written in Orbit</option>
              </select>
            )}
            <select value={type} onChange={(e) => setType(e.target.value)} className={sel}>
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select value={area} onChange={(e) => setArea(e.target.value)} className={sel}>
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
              <option value="">Any status</option>
              {(Object.keys(STATUS_LABELS) as DocStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s].label}
                </option>
              ))}
            </select>
            <select value={review} onChange={(e) => setReview(e.target.value as ReviewState | "")} className={sel}>
              <option value="">Any review state</option>
              {(Object.keys(REVIEW_LABELS) as ReviewState[]).map((s) => (
                <option key={s} value={s}>
                  {REVIEW_LABELS[s].label}
                </option>
              ))}
            </select>
          </div>
          <ul className="mt-4 space-y-2 md:hidden">
            {rows.length === 0 && <li className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-faint">No documents match.</li>}
            {rows.map((d) => (
              <li key={d.id}>
                <Link href={`/w/${slug}/p/${d.id}`} className="block rounded-xl border border-line bg-card p-3 active:bg-hover">
                  <div className="flex items-center gap-2 font-medium">
                    <span>{d.icon ?? "📄"}</span>
                    <span className="line-clamp-2 min-w-0 flex-1">{d.title || "Untitled"}</span>
                    {d.docStatus && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_LABELS[d.docStatus].cls}`}>{STATUS_LABELS[d.docStatus].label}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-ink-faint">
                    {(d.docType ?? (d.isSop ? "SOP" : "")) && <span>{d.docType ?? "SOP"}</span>}
                    {d.area && <span>· {d.area}</span>}
                    {d.ownerName && <span>· {d.ownerName}</span>}
                  </div>
                  <div className={`mt-1 text-xs font-medium ${TONE[REVIEW_LABELS[d.review].tone]}`}>
                    {REVIEW_LABELS[d.review].label}
                    {d.next ? ` · ${fmtDate(d.next)}` : ""}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-line md:block">
            <table className="w-full text-sm">
              <thead className="bg-side text-left text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-3 py-2">Document</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Area</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Review</th>
                  <th className="px-3 py-2">Next review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-ink-faint">
                      No documents match. Pages show up here once they have a type or status set in their Document info.
                    </td>
                  </tr>
                )}
                {rows.map((d) => (
                  <tr key={d.id} className="hover:bg-hover">
                    <td className="px-3 py-2">
                      <Link href={`/w/${slug}/p/${d.id}`} className="flex items-center gap-2 hover:underline">
                        <span>{d.icon ?? "📄"}</span>
                        <span className="truncate">{d.title || "Untitled"}</span>
                        {d.sourceLink && <ExternalLink size={12} className="shrink-0 text-ink-faint" />}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{d.docType ?? (d.isSop ? "SOP" : "")}</td>
                    <td className="px-3 py-2 text-ink-soft">{d.area ?? ""}</td>
                    <td className="px-3 py-2">{d.docStatus && <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_LABELS[d.docStatus].cls}`}>{STATUS_LABELS[d.docStatus].label}</span>}</td>
                    <td className="px-3 py-2 text-ink-soft">{d.ownerName ?? <span className="text-ink-faint">—</span>}</td>
                    <td className={`px-3 py-2 text-xs font-medium ${TONE[REVIEW_LABELS[d.review].tone]}`}>{REVIEW_LABELS[d.review].label}</td>
                    <td className="px-3 py-2 text-ink-soft">{d.next ? fmtDate(d.next) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
          {log.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-faint">No logged changes yet. On any page, use ••• → Log a change.</li>}
          {log.map((l) => (
            <li key={l.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/w/${slug}/p/${l.pageId}`} className="font-medium hover:underline">
                  {l.pageIcon ?? "📄"} {l.pageTitle || "Untitled"}
                </Link>
                <span className="text-xs text-ink-faint">
                  v{l.version} · {new Date(l.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {l.actorType === "ai" ? "AI" : l.actorType === "sync" ? "Drive sync" : (l.actorName ?? "Someone")}
                </span>
                <span className={`ml-auto rounded px-2 py-0.5 text-xs ${l.teamTold ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>{l.teamTold ? "Team told" : "Team not told yet"}</span>
              </div>
              <div className="mt-1">{l.note}</div>
              {l.why && <div className="mt-0.5 text-ink-soft">Why: {l.why}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
