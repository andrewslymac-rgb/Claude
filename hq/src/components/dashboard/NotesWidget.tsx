"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { saveNoteAction } from "@/app/actions";

/** A private scratchpad. Saves itself a moment after you stop typing. */
export function NotesWidget({ slug, widgetId, initial }: { slug: string; widgetId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const queue = (v: string) => {
    setText(v);
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await saveNoteAction(slug, widgetId, v);
      setState(r.ok ? "saved" : "error");
    }, 700);
  };
  return (
    <div className="relative">
      <textarea
        value={text}
        onChange={(e) => queue(e.target.value)}
        placeholder="Reminders, numbers, a parking lot for ideas… Only you see this."
        rows={7}
        className="w-full resize-y rounded-xl border border-line bg-paper/50 px-3 py-2.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-accent/60"
      />
      <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 text-[11px] text-ink-faint">
        {state === "saving" && (
          <>
            <Loader2 size={11} className="animate-spin" /> Saving
          </>
        )}
        {state === "saved" && (
          <>
            <Check size={11} /> Saved
          </>
        )}
        {state === "error" && <span className="text-danger">Not saved. Try again.</span>}
      </span>
    </div>
  );
}
