"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bot, Undo2 } from "lucide-react";
import { undoAiActivityAction } from "@/app/actions";

type A = { id: string; tool: string; summary: string; pageId: string | null; taskId: string | null; undoVersionId: string | null; undoneAt: string | null; createdAt: string; grantName: string | null };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function ActivityView({ slug, items, canUndo, embedded }: { slug: string; items: A[]; canUndo: boolean; embedded?: boolean }) {
  const [busy, start] = useTransition();
  return (
    <div className={embedded ? "" : "mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-8"}>
      {!embedded && (
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Bot size={24} className="text-accent" /> AI activity
        </h1>
      )}
      <p className="mt-1 text-sm text-ink-soft">Everything an AI tool changed in this company. Reads aren&apos;t listed. Undo puts things back the way they were.</p>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
        {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-faint">No AI changes yet.</li>}
        {items.map((a) => (
          <li key={a.id} className={`flex items-start gap-3 px-4 py-3 text-sm ${a.undoneAt ? "opacity-50" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className={a.undoneAt ? "line-through" : ""}>{a.summary}</div>
              <div className="mt-0.5 text-xs text-ink-faint">
                {a.grantName ?? "AI"} · {fmt(a.createdAt)}
                {a.pageId && (
                  <>
                    {" · "}
                    <Link href={`/w/${slug}/p/${a.pageId}`} className="text-accent hover:underline">
                      open page
                    </Link>
                  </>
                )}
                {a.taskId && (
                  <>
                    {" · "}
                    <Link href={`/w/${slug}/tasks`} className="text-accent hover:underline">
                      open tasks
                    </Link>
                  </>
                )}
                {a.undoneAt && <> · undone {fmt(a.undoneAt)}</>}
              </div>
            </div>
            {canUndo && !a.undoneAt && (
              <button disabled={busy} onClick={() => confirm("Undo this AI change?") && start(() => undoAiActivityAction(slug, a.id))} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs hover:bg-hover">
                <Undo2 size={12} /> Undo
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
