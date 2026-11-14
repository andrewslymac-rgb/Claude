"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, CalendarDays } from "lucide-react";
import { completeTaskAction, undoTaskAction } from "@/app/actions";
import { useAct } from "@/components/ui/Toast";
import type { TaskRow } from "@/lib/services/tasks";
import { TaskDrawer, type JobRole, type Member, type PageOpt } from "./TaskDialogs";

/** The full-page version of a task, with a way back to the tracker and calendar. */
export function TaskPageView(props: { slug: string; task: TaskRow; members: Member[]; roles: JobRole[]; pages: PageOpt[]; categories: readonly string[]; canEdit: boolean }) {
  const router = useRouter();
  const [, act] = useAct();
  const { slug, task } = props;
  return (
    <div>
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-4 md:px-8">
        <button onClick={() => (history.length > 1 ? router.back() : router.push(`/w/${slug}/tasks`))} className="flex min-h-10 items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <ChevronLeft size={16} /> Back
        </button>
        <Link href={`/w/${slug}/tasks/calendar`} className="flex min-h-10 items-center gap-1 text-sm text-accent">
          <CalendarDays size={15} /> Calendar
        </Link>
      </div>
      <TaskDrawer
        asPage
        slug={slug}
        task={task}
        members={props.members}
        roles={props.roles}
        pages={props.pages}
        categories={props.categories}
        canEdit={props.canEdit}
        onClose={() => router.push(`/w/${slug}/tasks`)}
        onDone={(t) => act(() => completeTaskAction(slug, t.id).then(() => router.refresh()))}
        onUndo={(t) => act(() => undoTaskAction(slug, t.id).then(() => router.refresh()))}
      />
    </div>
  );
}
