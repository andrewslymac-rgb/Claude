"use client";

import { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type Toast = { id: number; text: string; ok: boolean };
const Ctx = createContext<(text: string, ok?: boolean) => void>(() => {});

/** Small, auto-dismissing notices at the bottom of the screen. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, ok = true) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { id, text, ok }]);
  }, []);
  useEffect(() => {
    if (!list.length) return;
    const t = setTimeout(() => setList((l) => l.slice(1)), 4500);
    return () => clearTimeout(t);
  }, [list]);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4" style={{ bottom: "calc(env(safe-area-inset-bottom) + 84px)" }} aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`anim-rise pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm shadow-2xl ${t.ok ? "border-line bg-card" : "border-danger/40 bg-card text-danger"}`}>
            {t.ok ? <CheckCircle2 size={15} className="shrink-0 text-ok" /> : <AlertCircle size={15} className="shrink-0" />}
            <span className="min-w-0 flex-1">{t.text}</span>
            <button onClick={() => setList((l) => l.filter((x) => x.id !== t.id))} className="rounded p-0.5 text-ink-faint hover:text-ink" aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

/**
 * Runs a server action in a transition and reports failure as a toast instead of a
 * silent swallow. Pass `revert` to undo an optimistic UI change when it fails.
 */
export function useAct() {
  const toast = useToast();
  const [pending, start] = useTransition();
  const act = useCallback(
    (fn: () => Promise<unknown>, revert?: () => void) =>
      start(async () => {
        try {
          const r = (await fn()) as { ok?: boolean; error?: string } | undefined;
          if (r && r.ok === false) throw new Error(r.error ?? "Something went wrong.");
        } catch (e) {
          revert?.();
          toast((e as Error).message || "Something went wrong. Please try again.", false);
        }
      }),
    [toast],
  );
  return [pending, act] as const;
}
