"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ListPlus } from "lucide-react";
import { meetingStepToTaskAction } from "@/app/actions";
import { useToast } from "@/components/ui/Toast";
import type { MeetingNextStep, MeetingPart } from "@/db/schema";

export type MeetingView = { id: string; series: string; at: string; docUrl: string; attendees: string[]; summary: string; points: MeetingPart[]; decisions: MeetingPart[]; nextSteps: MeetingNextStep[]; topics: MeetingPart[]; recognised: boolean };

const TZ = "America/Los_Angeles";
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
export const fmtLong = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ });

/** A next step with the person Gemini named, plus a one-tap "make it a task". */
export function StepRow({ slug, meetingId, index, step, canMakeTasks, meetingLabel }: { slug: string; meetingId: string; index: number; step: MeetingNextStep; canMakeTasks: boolean; meetingLabel?: { href: string; text: string } }) {
  const [taskId, setTaskId] = useState(step.taskId ?? null);
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          {step.owner && <span className="mr-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{step.owner}</span>}
          <span className="font-medium">{step.title}</span>
        </div>
        {step.text && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.text}</p>}
        {meetingLabel && (
          <Link href={meetingLabel.href} className="mt-1 inline-block text-xs text-ink-faint hover:text-ink">
            {meetingLabel.text}
          </Link>
        )}
      </div>
      {taskId ? (
        <Link href={`/w/${slug}/tasks/${taskId}`} className="flex shrink-0 items-center gap-1 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-medium text-ok">
          <Check size={12} /> Task
        </Link>
      ) : canMakeTasks ? (
        <button
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await meetingStepToTaskAction(slug, meetingId, index);
              if (!r.ok) return toast(r.error, false);
              setTaskId(r.message ?? null);
              toast("Task created. Open it to assign someone and set the date.");
              router.refresh();
            })
          }
          className="btn btn-sm shrink-0"
          title="Make this a one-off Orbit task"
        >
          <ListPlus size={14} /> Task
        </button>
      ) : null}
    </li>
  );
}
