"use client";

import Link from "next/link";
import { Bot } from "lucide-react";
import { ActivityView } from "./ActivityView";
import { ProposalsView, type Proposal } from "./ProposalsView";

type A = Parameters<typeof ActivityView>[0]["items"];

export function AiHub({ slug, tab, activity, proposals, canUndo, canReview }: { slug: string; tab: "approvals" | "activity"; activity: A; proposals: Proposal[]; canUndo: boolean; canReview: boolean }) {
  const pending = proposals.filter((p) => p.status === "pending").length;
  const Tab = ({ k, label, badge }: { k: "approvals" | "activity"; label: string; badge?: number }) => (
    <Link href={`/w/${slug}/ai?tab=${k}`} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${tab === k ? "bg-hover font-medium text-ink" : "text-ink-soft hover:bg-hover"}`}>
      {label}
      {badge ? <span className="rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-warn">{badge}</span> : null}
    </Link>
  );
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-8">
      <h1 className="page-title flex items-center gap-2">
        <Bot size={24} className="text-accent" /> AI
      </h1>
      <p className="mt-1 text-sm text-ink-soft">What AI tools have asked to change, and what they changed.</p>
      <div className="mt-4 flex gap-1 border-b border-line pb-2">
        <Tab k="approvals" label="Needs approval" badge={pending} />
        <Tab k="activity" label="Activity" />
      </div>
      <div className="mt-4">{tab === "approvals" ? <ProposalsView slug={slug} items={proposals} canReview={canReview} /> : <ActivityView slug={slug} items={activity} canUndo={canUndo} embedded />}</div>
    </div>
  );
}
