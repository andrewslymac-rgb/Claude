"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { History, MoreHorizontal, BookMarked, Trash2, Check, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { archivePageAction, savePageAction, setSopAction } from "@/app/actions";
import type { EditorChange } from "./Editor";
import { EmojiPicker } from "./EmojiPicker";
import { VersionHistory } from "./VersionHistory";

const Editor = dynamic(() => import("./Editor"), { ssr: false, loading: () => <div className="h-40 animate-pulse rounded-lg bg-side" /> });

type PageData = { id: string; title: string; icon: string | null; content: unknown[]; isSop: boolean; source: string; archived: boolean; updatedAt: string };
type Crumb = { id: string; title: string; icon: string | null };
type SaveState = "idle" | "saving" | "saved" | "error";

export function PageView({ slug, page, crumbs, subpages, canEdit }: { slug: string; page: PageData; crumbs: Crumb[]; subpages: Crumb[]; canEdit: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [isSop, setIsSop] = useState(page.isSop);
  const [save, setSave] = useState<SaveState>("idle");
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [history, setHistory] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [content, setContent] = useState(page.content);
  const [, start] = useTransition();
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
    <div className="relative min-h-full">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex h-11 items-center gap-2 bg-paper/90 px-4 text-sm backdrop-blur">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-ink-soft">
          {crumbs.map((c) => (
            <span key={c.id} className="flex min-w-0 items-center gap-1">
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
        <button onClick={() => setHistory(true)} className="flex items-center gap-1 rounded-md px-2 py-1 text-ink-soft hover:bg-hover">
          <History size={15} /> History
        </button>
        {canEdit && (
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="rounded-md p-1 text-ink-soft hover:bg-hover" aria-label="More">
              <MoreHorizontal size={18} />
            </button>
            {menu && (
              <div className="absolute right-0 top-8 w-56 rounded-lg border border-line bg-card p-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover"
                  onClick={() => {
                    setMenu(false);
                    setIsSop(!isSop);
                    start(() => setSopAction(slug, page.id, !isSop));
                  }}
                >
                  <BookMarked size={15} /> {isSop ? "Unmark as SOP" : "Mark as SOP / policy"}
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-danger hover:bg-danger-soft"
                  onClick={() =>
                    start(async () => {
                      await flush();
                      await archivePageAction(slug, page.id);
                      router.push(crumbs.length ? `/w/${slug}/p/${crumbs.at(-1)!.id}` : `/w/${slug}`);
                    })
                  }
                >
                  <Trash2 size={15} /> Move to Trash
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {page.archived && <Banner>This page is in the Trash. Restore it from the Trash to edit it again.</Banner>}
      {page.source === "gdrive" && (
        <Banner>
          This SOP is synced from Google Drive and updates automatically. To change it, edit the Google Doc.
          <ExternalLink size={14} className="ml-1 inline" />
        </Banner>
      )}

      <article className="mx-auto max-w-[760px] px-6 pb-40 pt-10 md:px-14">
        {/* Icon + title */}
        <div className="relative mb-2">
          <button
            onClick={() => canEdit && setPicker((p) => !p)}
            className={`text-5xl leading-none ${canEdit ? "rounded-lg p-1 hover:bg-hover" : "cursor-default"}`}
            title={canEdit ? "Change icon" : undefined}
          >
            {icon ?? (canEdit ? <span className="text-sm text-ink-faint">＋ Add icon</span> : "📄")}
          </button>
          {picker && (
            <EmojiPicker
              onClose={() => setPicker(false)}
              onPick={(e) => {
                setIcon(e);
                setPicker(false);
                queue({ icon: e }, 0);
              }}
            />
          )}
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
          className="mb-4 w-full resize-none overflow-hidden bg-transparent text-[40px] font-bold leading-tight tracking-tight outline-none placeholder:text-ink-faint"
          autoFocus={canEdit && !page.title}
        />

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
