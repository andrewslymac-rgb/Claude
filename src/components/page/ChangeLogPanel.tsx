"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ClipboardList, History, Plus, User, Bot, X, FileText, Wrench, Check, Trash2, CheckSquare, Flag, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { addDocNoteAction, deleteDocNoteAction, listDocNotesAction, listVersionsAction, resolveDocNoteAction, setTeamToldAction } from "@/app/actions";
import { useAct, useToast } from "@/components/ui/Toast";

type V = Awaited<ReturnType<typeof listVersionsAction>>[number];
type N = Awaited<ReturnType<typeof listDocNotesAction>>[number];
export type PageRelations = {
  usedBy: { id: string; title: string; frequency: string }[];
  openFlags: { id: string; title: string; severity: string; status: string }[];
  meta: { updatedAt: string | null; updatedBy: string | null; driveModifiedAt: string | null; createdAt: string | null; words: number };
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** A version counts as a change-log entry when someone wrote a note for it (not autosaves, imports or restores). */
export const isLogEntry = (v: V) => Boolean(v.note) && v.actorType !== "sync" && v.note !== "Created" && !v.note!.startsWith("Restored");

/**
 * The document side panel: what still needs changing, the change log, where the
 * document is used, and who touched it last.
 */
export function ChangeLogPanel({
  slug,
  pageId,
  canLog,
  canNote = true,
  isDrive,
  versionLabel,
  refreshKey,
  relations,
  onLog,
  onHistory,
  onClose,
  onCount,
}: {
  slug: string;
  pageId: string;
  canLog: boolean;
  canNote?: boolean;
  isDrive: boolean;
  versionLabel: string | null;
  refreshKey: number;
  relations?: PageRelations;
  onLog: () => void;
  onHistory: () => void;
  onClose?: () => void;
  onCount?: (n: number) => void;
}) {
  const [entries, setEntries] = useState<V[] | null>(null);
  const [notes, setNotes] = useState<N[] | null>(null);
  const [draft, setDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [adding, startAdd] = useTransition();
  const [, act] = useAct();
  const toast = useToast();

  const loadNotes = () => listDocNotesAction(slug, pageId).then(setNotes);
  useEffect(() => {
    listVersionsAction(slug, pageId).then((v) => {
      const e = v.filter(isLogEntry);
      setEntries(e);
    });
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, pageId, refreshKey]);
  const open = notes?.filter((n) => !n.resolvedAt) ?? [];
  const resolved = notes?.filter((n) => n.resolvedAt) ?? [];
  useEffect(() => onCount?.(open.length + (entries?.length ?? 0)), [open.length, entries, onCount]);

  const toggleTold = (v: V) => {
    setEntries((es) => es?.map((x) => (x.id === v.id ? { ...x, teamTold: !x.teamTold } : x)) ?? null);
    act(() => setTeamToldAction(slug, pageId, v.id, !v.teamTold), () => setEntries((es) => es?.map((x) => (x.id === v.id ? { ...x, teamTold: v.teamTold } : x)) ?? null));
  };
  const resolve = (n: N, done: boolean) => {
    setNotes((ns) => ns?.map((x) => (x.id === n.id ? { ...x, resolvedAt: done ? new Date().toISOString() : null } : x)) ?? null);
    act(() => resolveDocNoteAction(slug, pageId, n.id, done), () => loadNotes());
    if (done && canLog) toast("Marked as changed. Log the change so the team knows what's new.");
  };
  const remove = (n: N) => {
    if (!confirm("Delete this note?")) return;
    setNotes((ns) => ns?.filter((x) => x.id !== n.id) ?? null);
    act(() => deleteDocNoteAction(slug, pageId, n.id), () => loadNotes());
  };
  const add = () =>
    startAdd(async () => {
      const r = await addDocNoteAction(slug, pageId, draft);
      if (!r.ok) return toast(r.error, false);
      setDraft("");
      await loadNotes();
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <FileText size={16} className="text-accent" /> Document
            {versionLabel && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">{versionLabel}</span>}
          </h2>
          <p className="mt-0.5 text-xs text-ink-faint">What needs changing, what changed, and where it&apos;s used.</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="tap-icon rounded p-1 hover:bg-hover" aria-label="Close">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-thin">
        {/* Needs changing */}
        <section>
          <h3 className="eyebrow flex items-center gap-1.5">
            <Wrench size={11} /> Needs changing {open.length > 0 && <span className="rounded-full bg-warn-soft px-1.5 text-[10px] font-semibold text-warn">{open.length}</span>}
          </h3>
          {canNote && (
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) add();
              }}
            >
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What's wrong or out of date?" className="field min-w-0 flex-1 py-1.5 text-sm" aria-label="New revision note" />
              <button disabled={adding || !draft.trim()} className="btn btn-primary btn-sm shrink-0">
                <Plus size={13} /> Add
              </button>
            </form>
          )}
          <ul className="mt-2 space-y-1.5">
            {notes === null && <li className="text-xs text-ink-faint">Loading…</li>}
            {notes && open.length === 0 && <li className="rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-ink-faint">Nothing flagged. When you spot something wrong or outdated, note it here so it isn&apos;t forgotten.</li>}
            {open.map((n) => (
              <li key={n.id} className="group flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft/40 px-2.5 py-2">
                <button
                  disabled={!canLog}
                  onClick={() => resolve(n, true)}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${canLog ? "border-ink-faint hover:border-ok hover:text-ok" : "border-line"} text-transparent`}
                  title={canLog ? "Mark as changed" : undefined}
                  aria-label="Mark as changed"
                >
                  <Check size={12} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-snug">{n.body}</div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">
                    {n.by ?? n.byEmail ?? "Someone"} · {fmt(n.createdAt)}
                  </div>
                </div>
                {canLog && (
                  <button onClick={() => remove(n)} className="tap-icon rounded p-1 text-ink-faint hover:bg-danger-soft hover:text-danger md:opacity-0 md:group-hover:opacity-100" aria-label="Delete note">
                    <Trash2 size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {resolved.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setShowResolved((v) => !v)} className="flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink">
                {showResolved ? <ChevronDown size={11} /> : <ChevronRight size={11} />} {resolved.length} done
              </button>
              {showResolved && (
                <ul className="mt-1 space-y-1">
                  {resolved.map((n) => (
                    <li key={n.id} className="flex items-start gap-2 px-2.5 py-1 text-xs text-ink-faint">
                      <Check size={12} className="mt-0.5 shrink-0 text-ok" />
                      <span className="min-w-0 flex-1">
                        <span className="line-through">{n.body}</span>
                        <span className="block text-[10px]">
                          done {n.resolvedAt && fmt(n.resolvedAt)}
                          {n.resolvedBy ? ` by ${n.resolvedBy}` : ""}
                        </span>
                      </span>
                      {canLog && (
                        <button onClick={() => resolve(n, false)} className="shrink-0 hover:text-ink" title="Reopen">
                          Reopen
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Change log */}
        <section className="mt-6">
          <h3 className="eyebrow flex items-center gap-1.5">
            <ClipboardList size={11} /> Change log
          </h3>
          {canLog && (
            <div className="mt-2">
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
          <div className="mt-3">
            {entries === null ? (
              <div className="text-sm text-ink-faint">Loading…</div>
            ) : entries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line px-3 py-3 text-xs text-ink-faint">No changes logged yet. When you update this document, log what changed so the team knows.</div>
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
        </section>

        {/* Where it's used */}
        {relations && (relations.usedBy.length > 0 || relations.openFlags.length > 0) && (
          <section className="mt-6">
            <h3 className="eyebrow">Where it&apos;s used</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {relations.usedBy.map((t) => (
                <li key={t.id}>
                  <Link href={`/w/${slug}/tasks`} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-hover">
                    <CheckSquare size={13} className="shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="text-[11px] capitalize text-ink-faint">{t.frequency}</span>
                  </Link>
                </li>
              ))}
              {relations.openFlags.map((f) => (
                <li key={f.id}>
                  <Link href={`/w/${slug}/flags`} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-hover">
                    <Flag size={13} className="shrink-0 text-warn" />
                    <span className="min-w-0 flex-1 truncate">{f.title}</span>
                    <span className="text-[11px] capitalize text-ink-faint">{f.severity}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="space-y-1.5 border-t border-line px-4 py-3 text-[11px] text-ink-faint">
        {relations?.meta.updatedAt && (
          <div className="flex items-center gap-1.5">
            <Clock size={11} /> Edited {fmtTime(relations.meta.updatedAt)}
            {relations.meta.updatedBy ? ` by ${relations.meta.updatedBy}` : ""}
            {relations.meta.words ? ` · ${relations.meta.words.toLocaleString()} words` : ""}
          </div>
        )}
        {relations?.meta.driveModifiedAt && <div className="pl-[17px]">Google Doc last changed {fmtTime(relations.meta.driveModifiedAt)}</div>}
        <button onClick={onHistory} className="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
          <History size={14} /> See every saved version
        </button>
      </div>
    </div>
  );
}
