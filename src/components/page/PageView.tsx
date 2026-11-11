"use client";

import { useAct } from "@/components/ui/Toast";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { History, MoreHorizontal, BookMarked, Trash2, Check, Loader2, AlertCircle, ExternalLink, ArrowLeftRight, FileCheck2, FileText, ClipboardList, Flag, ChevronLeft } from "lucide-react";
import { FlagForm } from "@/components/library/FlagsView";
import { PopMenu, MenuItem } from "@/components/ui/Menu";
import { DocInfo, type DocInfoData } from "./DocInfo";
import { LogChangeDialog } from "./LogChangeDialog";
import { ChangeLogPanel, type PageRelations } from "./ChangeLogPanel";
import { archivePageAction, resolveDriveConflictAction, savePageAction, setSopAction } from "@/app/actions";
import type { EditorChange } from "./Editor";
import { EmojiPicker } from "./EmojiPicker";
import { VersionHistory } from "./VersionHistory";

const Editor = dynamic(() => import("./Editor"), { ssr: false, loading: () => <div className="h-40 animate-pulse rounded-lg bg-side" /> });

type PageData = { id: string; title: string; icon: string | null; content: unknown[]; isSop: boolean; source: string; twoWay?: boolean; drivePending?: boolean; driveConflict?: boolean; archived: boolean; updatedAt: string };
type Crumb = { id: string; title: string; icon: string | null };
type SaveState = "idle" | "saving" | "saved" | "error";

type DocOptions = { types: readonly string[]; areas: readonly string[]; audiences: readonly string[] };

export function PageView({ slug, page, crumbs, subpages, canEdit, canLog = canEdit, docInfo, members, docOptions, relations }: { slug: string; page: PageData; crumbs: Crumb[]; subpages: Crumb[]; canEdit: boolean; canLog?: boolean; relations?: PageRelations; docInfo: DocInfoData; members: { id: string; name: string }[]; docOptions: DocOptions }) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [isSop, setIsSop] = useState(page.isSop);
  const [save, setSave] = useState<SaveState>("idle");
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [history, setHistory] = useState(false);
  const [logChange, setLogChange] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [docSetup, setDocSetup] = useState(false);
  const isDoc = Boolean(docInfo.docType || docInfo.docStatus || docInfo.reviewCycle);
  const isDrive = page.source === "gdrive";
  const showLog = isSop || isDoc || isDrive;
  const [logOpen, setLogOpen] = useState(false); // drawer on screens without room for the side panel
  const [logKey, setLogKey] = useState(0);
  const [logCount, setLogCount] = useState<number | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [content, setContent] = useState(page.content);
  const [, start] = useTransition();
  const [, act] = useAct();
  const focusEditor = useRef<(() => void) | null>(null);

  // --- autosave -----------------------------------------------------------
  const pendingPatch = useRef<{ title?: string; icon?: string | null; content?: unknown[]; contentText?: string }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pendingPatch.current;
    if (Object.keys(patch).length === 0) return;
    pendingPatch.current = {};
    setSave("saving");
    try {
      await savePageAction(slug, page.id, patch);
      setSave("saved");
    } catch {
      pendingPatch.current = { ...patch, ...pendingPatch.current };
      setSave("error");
      timer.current = setTimeout(flush, 4000); // retry
    }
  }, [slug, page.id]);

  const queue = useCallback(
    (patch: typeof pendingPatch.current, delay = 700) => {
      pendingPatch.current = { ...pendingPatch.current, ...patch };
      setSave("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush],
  );

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pendingPatch.current).length) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      flush(); // save when navigating to another page
    };
  }, [flush]);

  const onEditorChange = useCallback((c: EditorChange) => queue(c), [queue]);

  return (
    <div className="relative flex min-h-full">
    <div className="relative min-w-0 flex-1">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex h-12 items-center gap-0.5 bg-paper/90 px-1.5 text-sm backdrop-blur md:h-11 md:gap-2 md:px-4">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-ink-soft">
          <button onClick={() => (window.history.length > 1 ? router.back() : router.push(`/w/${slug}`))} className="hidden h-7 w-7 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-hover hover:text-ink md:flex" title="Back" aria-label="Back">
            <ChevronLeft size={16} />
          </button>
          {crumbs.map((c) => (
            <span key={c.id} className="hidden min-w-0 items-center gap-1 sm:flex">
              <Link href={`/w/${slug}/p/${c.id}`} className="truncate rounded px-1 py-0.5 hover:bg-hover">
                {c.icon ?? "📄"} {c.title}
              </Link>
              <span className="text-ink-faint">/</span>
            </span>
          ))}
          <span className="truncate px-1 text-ink">
            {icon ?? "📄"} {title || "Untitled"}
          </span>
        </nav>
        <SaveIndicator state={save} />
        {isSop && <span className="rounded bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">SOP</span>}
        <button onClick={() => setFlagging(true)} className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 text-ink-soft hover:bg-hover hover:text-warn md:h-auto md:min-w-0 md:py-1" title="Something off? Flag it for the owners.">
          <Flag size={20} className="md:hidden" /><Flag size={15} className="hidden md:block" /> <span className="hidden sm:inline">Flag</span>
        </button>
        {showLog && (
          <button onClick={() => setLogOpen(true)} aria-label="Document panel" title="Document panel" className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg bg-accent-soft px-2 font-medium text-accent hover:opacity-90 md:h-auto md:min-w-0 md:py-1 xl:hidden">
            <FileText size={20} className="md:hidden" />
            <FileText size={15} className="hidden md:block" /> <span className="hidden sm:inline">Document</span>
            {logCount ? <span className="text-xs opacity-80">{logCount}</span> : null}
          </button>
        )}
        <button onClick={() => setHistory(true)} className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 text-ink-soft hover:bg-hover md:h-auto md:min-w-0 md:py-1">
          <History size={20} className="md:hidden" /><History size={15} className="hidden md:block" /> <span className="hidden sm:inline">History</span>
        </button>
        {canEdit && (
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft hover:bg-hover md:h-auto md:w-auto md:p-1" aria-label="More">
              <MoreHorizontal size={22} className="md:hidden" /><MoreHorizontal size={18} className="hidden md:block" />
            </button>
            <PopMenu open={menu} onClose={() => setMenu(false)} title={title || "Untitled"} width="w-60">
              <MenuItem
                icon={<BookMarked size={15} />}
                onClick={() => {
                  setMenu(false);
                  setIsSop(!isSop);
                  act(() => setSopAction(slug, page.id, !isSop), () => setIsSop(isSop));
                }}
              >
                {isSop ? "Unmark as SOP" : "Mark as SOP / policy"}
              </MenuItem>
              <MenuItem icon={<FileCheck2 size={15} />} onClick={() => (setMenu(false), setDocSetup(true))}>
                {isDoc ? "Edit document info" : "Set up as document"}
              </MenuItem>
              <MenuItem icon={<ClipboardList size={15} />} onClick={() => (setMenu(false), setLogChange(true))}>
                Log a change
              </MenuItem>
              <MenuItem
                icon={<Trash2 size={15} />}
                danger
                onClick={() => {
                  setMenu(false);
                  start(async () => {
                    await flush();
                    await archivePageAction(slug, page.id);
                    router.push(crumbs.length ? `/w/${slug}/p/${crumbs.at(-1)!.id}` : `/w/${slug}`);
                  });
                }}
              >
                Move to Trash
              </MenuItem>
            </PopMenu>
          </div>
        )}
      </div>

      {page.archived && <Banner>This page is in the Trash. Restore it from the Trash to edit it again.</Banner>}
      {page.source === "gdrive" && page.driveConflict && (
        <ConflictBanner
          slug={slug}
          pageId={page.id}
          sourceLink={docInfo.sourceLink}
          onResolved={(keep) => {
            if (keep === "drive") router.refresh();
            setTimeout(() => window.location.reload(), 300);
          }}
          flush={flush}
        />
      )}
      {page.source === "gdrive" && !page.driveConflict && (
        page.twoWay ? (
          <div className="mx-auto mt-2 flex max-w-[760px] flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-side/60 px-4 py-2 text-xs text-ink-soft">
            <ArrowLeftRight size={13} className="text-accent" />
            <span>Synced both ways with Google Docs. Edits here reach the Doc about a minute after you stop typing{page.drivePending || save !== "idle" ? " (waiting to send)" : ""}.</span>
            {docInfo.sourceLink && (
              <a href={docInfo.sourceLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                Open the Doc <ExternalLink size={12} />
              </a>
            )}
          </div>
        ) : (
          <Banner>
            This page is synced from Google Drive and updates automatically. To change it, edit the original.
            {docInfo.sourceLink && (
              <a href={docInfo.sourceLink} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 font-medium underline">
                Open in Google Drive <ExternalLink size={13} />
              </a>
            )}
          </Banner>
        )
      )}

      <article className="mx-auto max-w-[760px] px-4 pb-40 pt-6 md:px-14 md:pt-10">
        {/* Icon + title */}
        <div className="relative mb-2">
          <button
            onClick={() => canEdit && setPicker((p) => !p)}
            className={`text-5xl leading-none ${canEdit ? "rounded-lg p-1 hover:bg-hover" : "cursor-default"}`}
            title={canEdit ? "Change icon" : undefined}
          >
            {icon ?? (canEdit ? <span className="text-sm text-ink-faint">＋ Add icon</span> : "📄")}
          </button>
          <PopMenu open={picker} onClose={() => setPicker(false)} title="Page icon" align="left" width="w-72">
            <EmojiPicker
              onClose={() => setPicker(false)}
              onPick={(e) => {
                setIcon(e);
                setPicker(false);
                queue({ icon: e }, 0);
              }}
            />
          </PopMenu>
        </div>
        <textarea
          value={title}
          readOnly={!canEdit}
          rows={1}
          placeholder="Untitled"
          onChange={(e) => {
            setTitle(e.target.value);
            queue({ title: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              focusEditor.current?.();
            }
          }}
          ref={(el) => {
            if (el) {
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }
          }}
          className="mb-4 w-full resize-none overflow-hidden bg-transparent text-3xl font-bold leading-tight tracking-tight outline-none placeholder:text-ink-faint md:text-[40px]"
          autoFocus={canEdit && !page.title}
        />

        {(isDoc || docSetup) && <DocInfo key={docSetup ? "open" : "closed"} slug={slug} pageId={page.id} initial={docInfo} members={members} options={docOptions} canEdit={canEdit} forceOpen={docSetup} onClose={() => setDocSetup(false)} />}

        <Editor key={editorKey} initial={content} editable={canEdit} onChange={canEdit ? onEditorChange : undefined} focusRef={focusEditor} />

        {subpages.length > 0 && (
          <div className="mt-10 border-t border-line pt-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Pages inside</div>
            <div className="grid gap-1">
              {subpages.map((s) => (
                <Link key={s.id} href={`/w/${slug}/p/${s.id}`} className="rounded-md px-2 py-1.5 hover:bg-hover">
                  {s.icon ?? "📄"} <span className="underline decoration-line underline-offset-4">{s.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>

    </div>

      {showLog && (
        <aside className="sticky top-0 hidden h-dvh w-80 shrink-0 self-start border-l border-line bg-side/40 xl:block">
          <ChangeLogPanel slug={slug} pageId={page.id} canLog={canLog} isDrive={isDrive} versionLabel={docInfo.docVersion} refreshKey={logKey} relations={relations} onCount={setLogCount} onLog={() => setLogChange(true)} onHistory={() => setHistory(true)} />
        </aside>
      )}
      {showLog && logOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 xl:hidden" onMouseDown={() => setLogOpen(false)}>
          <div className="h-full w-full max-w-sm border-l border-line bg-card pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <ChangeLogPanel
              slug={slug}
              pageId={page.id}
              canLog={canLog}
              isDrive={isDrive}
              versionLabel={docInfo.docVersion}
              refreshKey={logKey}
              relations={relations}
              onCount={setLogCount}
              onLog={() => setLogChange(true)}
              onHistory={() => (setLogOpen(false), setHistory(true))}
              onClose={() => setLogOpen(false)}
            />
          </div>
        </div>
      )}

      {flagging && <FlagForm slug={slug} pages={[{ id: page.id, title: title || "Untitled", icon }]} presetPageId={page.id} onClose={() => setFlagging(false)} />}
      {logChange && <LogChangeDialog slug={slug} pageId={page.id} currentVersionLabel={docInfo.docVersion} isDrive={isDrive} onClose={() => setLogChange(false)} onSaved={() => (setLogKey((k) => k + 1), router.refresh())} />}

      {history && (
        <VersionHistory
          slug={slug}
          pageId={page.id}
          canRestore={canEdit}
          onClose={() => setHistory(false)}
          beforeRestore={flush}
          onRestored={(restored) => {
            setHistory(false);
            setTitle(restored.title);
            setContent(restored.content);
            setEditorKey((k) => k + 1); // remount the editor with the restored content
            setSave("saved");
            setLogKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto mt-2 max-w-[760px] rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn">{children}</div>;
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") return <span className="flex items-center gap-1 text-xs text-ink-faint"><Loader2 size={12} className="animate-spin" /> Saving</span>;
  if (state === "saved") return <span className="flex items-center gap-1 text-xs text-ink-faint"><Check size={12} /> Saved</span>;
  if (state === "error") return <span className="flex items-center gap-1 text-xs text-danger"><AlertCircle size={12} /> Not saved — retrying</span>;
  return null;
}

function ConflictBanner({ slug, pageId, sourceLink, onResolved, flush }: { slug: string; pageId: string; sourceLink: string | null; onResolved: (keep: "orbit" | "drive") => void; flush: () => Promise<void> }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const pick = (keep: "orbit" | "drive") =>
    start(async () => {
      await flush();
      const r = await resolveDriveConflictAction(slug, pageId, keep);
      if (r.ok) onResolved(keep);
      else setError(r.error);
    });
  return (
    <div className="mx-auto mt-2 max-w-[760px] rounded-lg border border-warn bg-warn-soft px-4 py-3 text-sm text-warn">
      <div className="font-semibold">This SOP was changed in Orbit and in Google Docs at the same time.</div>
      <p className="mt-0.5 text-ink-soft">
        Nothing was overwritten. Pick which version to keep; the other stays in History (Orbit) or Version history (Google Docs).
        {sourceLink && (
          <a href={sourceLink} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 font-medium text-accent hover:underline">
            Compare with the Doc <ExternalLink size={12} />
          </a>
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => pick("orbit")} className="btn btn-primary btn-sm">
          Keep Orbit&rsquo;s version
        </button>
        <button disabled={busy} onClick={() => pick("drive")} className="btn btn-secondary btn-sm">
          Use the Google Doc
        </button>
      </div>
      {error && <p className="mt-2 text-danger">{error}</p>}
    </div>
  );
}
