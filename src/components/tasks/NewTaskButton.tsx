"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Plus } from "lucide-react";
import { taskFormOptionsAction } from "@/app/actions";
import { TaskForm } from "./TaskDialogs";

type Opts = Awaited<ReturnType<typeof taskFormOptionsAction>>;

/**
 * "New task" from anywhere in Orbit: the sidebar button, and a floating + on phones
 * (Home only, so it never covers a list or a page you're writing).
 */
export function NewTaskButton({ slug, variant }: { slug: string; variant: "sidebar" | "fab" }) {
  const pathname = usePathname();
  const [opts, setOpts] = useState<Opts | null>(null);
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [loading, start] = useTransition();

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(null), 5000);
    return () => clearTimeout(t);
  }, [added]);

  const go = () =>
    start(async () => {
      if (!opts) setOpts(await taskFormOptionsAction(slug));
      setOpen(true);
    });

  const base = `/w/${slug}`;
  if (variant === "fab" && pathname !== base) return null;
  // Render overlays outside the sidebar: its slide-in transform would trap fixed elements.
  const portal = (node: React.ReactNode) => (typeof document === "undefined" ? null : createPortal(node, document.querySelector("[data-ws-theme]") ?? document.body));

  return (
    <>
      {variant === "sidebar" ? (
        <button onClick={go} className="btn btn-primary w-full justify-center">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} New task
        </button>
      ) : (
        <button
          onClick={go}
          aria-label="New task"
          className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-paper shadow-xl md:hidden"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 76px)" }}
        >
          {loading ? <Loader2 size={22} className="animate-spin" /> : <Plus size={24} />}
        </button>
      )}
      {open && opts && portal(<TaskForm slug={slug} members={opts.members} roles={opts.roles} pages={opts.pages} categories={opts.categories} preset={{ frequency: "weekly" }} onClose={() => setOpen(false)} onCreated={setAdded} />)}
      {added &&
        portal(
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm shadow-2xl" style={{ bottom: "calc(env(safe-area-inset-bottom) + 84px)" }}>
          <Check size={16} className="text-ok" /> Added &ldquo;{added}&rdquo;
          <Link href={`${base}/tasks`} onClick={() => setAdded(null)} className="font-medium text-accent hover:underline">
            View in Tracker
          </Link>
        </div>,
        )}
    </>
  );
}
