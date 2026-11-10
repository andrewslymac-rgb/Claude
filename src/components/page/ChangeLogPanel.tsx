"use client";

import { useEffect, useState, useTransition } from "react";
import { ClipboardList, History, Plus, User, Bot, X, FileText } from "lucide-react";
import { listVersionsAction, setTeamToldAction } from "@/app/actions";

type V = Awaited<ReturnType<typeof listVersionsAction>>[number];

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** A version counts as a change-log entry when someone wrote a note for it (not autosaves, imports or restores). */
export const isLogEntry = (v: V) => Boolean(v.note) && v.actorType !== "sync" && v.note !== "Created" && !v.note!.startsWith("Restored");

export function ChangeLogPanel({
  slug,
  pageId,
  canLog,
  isDrive,
  versionLabel,
  refreshKey,
  onLog,
  onHistory,
  onClose,
  onCount,
}: {
  slug: string;
  pageId: string;
  canLog: boolean;
  isDrive: boolean;
  versionLabel: string | null;
  refreshKey: number;
  onLog: () => void;
  onHistory: () => void;
  onClose?: () => void;
  onCount?: (n: number) => void;
}) {
  const [entries, setEntries] = useState<V[] | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    listVersionsAction(slug, pageId).then((v) => {
      const e = v.filter(isLogEntry);
      setEntries(e);
      onCount?.(e.length);
    });
  }, [slug, pageId, refreshKey, onCount]);

  const toggleTold = (v: V) => {
    setEntries((es) => es?.map((x) => (x.id === v.id ? { ...x, teamTold: !x.teamTold } : x)) ?? null);
    start(() => setTeamToldAction(slug, pageId, v.id, !v.teamTold));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <ClipboardList size={16} className="text-accent" /> Change log
            {versionLabel && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">{versionLabel}</span>}
          </h2>
          <p className="mt-0.5 text-xs text-ink-faint">What changed in this document, and why.</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded p-1 hover:bg-hover" aria-label="Close">
            <X size={16} />
          </button>
        )}
      </div>

      {canLog && (
        <div className="px-4">
          <button onClick={onLog} className="btn btn-primary w-full justify-center">
            <Plus size={15} /> Log a change
          </button>
          {isDrive && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-faint">
              <FileText size={11} /> Also added to the bottom of the Google Doc
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex-1 overflow-y-auto px-4 pb-4">
        {entries === null ? (
          <div className="text-sm text-ink-faint">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-3 py-4 text-sm text-ink-soft">
            No changes logged yet. When you update this document, log what changed so the team knows.
          </div>
        ) : (
          <ol className="relative ml-1.5 border-l border-line">
            {entries.map((v) => (
              <li key={v.id} className="relative mb-4 pl-4 last:mb-0">
                <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-accent" />
                <div className="text-xs font-medium text-ink-faint">{fmt(v.createdAt)}</div>
                <div className="mt-0.5 text-sm text-ink">{v.note}</div>
                {v.why && <div className="mt-0.5 text-xs text-ink-soft">Why: {v.why}</div>}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                  <span className="flex items-center gap-1">
                    {v.actorType === "ai" ? <Bot size={11} /> : <User size={11} />}
                    {v.actorType === "ai" ? "Claude" : (v.actorName ?? "Someone")}
                  </span>
                  <button
                    disabled={!canLog}
                    onClick={() => toggleTold(v)}
                    className={`rounded px-1.5 py-0.5 font-medium ${v.teamTold ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"} ${canLog ? "hover:opacity-80" : "cursor-default"}`}
                    title={canLog ? "Click to change" : undefined}
                  >
                    {v.teamTold ? "Team told" : "Team not told yet"}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        <button onClick={onHistory} className="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
          <History size={14} /> See every saved version
        </button>
      </div>
    </div>
  );
}
