"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleDot, ListPlus, RotateCcw } from "lucide-react";
import { meetingStepToTaskAction, setMeetingStepDoneAction } from "@/app/actions";
import { useToast } from "@/components/ui/Toast";
import type { MeetingNextStep, MeetingPart } from "@/db/schema";
import type { StepStatus } from "@/lib/meetings/service";

export type MeetingView = { id: string; series: string; at: string; docUrl: string; attendees: string[]; summary: string; points: MeetingPart[]; decisions: MeetingPart[]; nextSteps: MeetingNextStep[]; topics: MeetingPart[]; recognised: boolean; status: StepStatus[] };

const TZ = "America/Los_Angeles";
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
export const fmtLong = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ });
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 864e5));

/** A next step: who Gemini named, where it stands, and one tap to make it a task or tick it off. */
export function StepRow({ slug, meetingId, index, step, status, canMakeTasks, meetingLabel, meetingAt }: { slug: string; meetingId: string; index: number; step: MeetingNextStep; status?: StepStatus; canMakeTasks: boolean; meetingLabel?: { href: string; text: string }; meetingAt?: string }) {
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const st = status ?? { status: step.taskId ? "task" : "open" };
  const age = meetingAt ? daysAgo(meetingAt) : null;
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error ?? "Something went wrong", false);
      if (ok) toast(ok);
      router.refresh();
    });
  return (
    <li className={`flex items-start gap-3 px-4 py-3 ${st.status === "done" ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          {step.owner && <span className="mr-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{step.owner}</span>}
          <span className={`font-medium ${st.status === "done" ? "line-through" : ""}`}>{step.title}</span>
        </div>
        {step.text && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.text}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {st.status === "done" && <span className="flex items-center gap-1 font-medium text-ok"><Check size={12} /> Done</span>}
          {st.status === "task" && step.taskId && (
            <Link href={`/w/${slug}/tasks/${step.taskId}`} className={`flex items-center gap-1 font-medium ${st.taskOverdue ? "text-danger" : "text-accent"}`}>
              <CircleDot size={12} /> Task{st.taskDue ? `, due ${shortDate(st.taskDue)}` : ""}{st.taskOverdue ? " (overdue)" : ""}
            </Link>
          )}
          {st.status === "open" && <span className={`font-medium ${age !== null && age > 14 ? "text-warn" : "text-ink-soft"}`}>Open{age !== null ? ` · ${age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"}`}` : ""}{st.taskRemoved ? " · its task was removed" : ""}</span>}
          {meetingLabel && (
            <Link href={meetingLabel.href} className="text-ink-faint hover:text-ink">
              {meetingLabel.text}
            </Link>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {st.status === "open" && canMakeTasks && (
          <button disabled={busy} onClick={() => act(() => meetingStepToTaskAction(slug, meetingId, index), "Task created and labelled with this meeting.")} className="btn btn-sm" title="Make this a one-off Orbit task">
            <ListPlus size={14} /> Task
          </button>
        )}
        {st.status === "open" && (
          <button disabled={busy} onClick={() => act(() => setMeetingStepDoneAction(slug, meetingId, index, true))} className="btn btn-ghost btn-sm" title="Already handled; no task needed">
            <Check size={14} /> Done
          </button>
        )}
        {st.status === "done" && step.doneAt && (
          <button disabled={busy} onClick={() => act(() => setMeetingStepDoneAction(slug, meetingId, index, false))} className="btn btn-ghost btn-sm" title="Open it again">
            <RotateCcw size={14} /> Reopen
          </button>
        )}
      </div>
    </li>
  );
}
