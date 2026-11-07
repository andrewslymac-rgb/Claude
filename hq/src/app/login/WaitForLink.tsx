"use client";

import { useEffect, useState } from "react";

/**
 * After a sign-in link is emailed, this polls until the link is clicked anywhere
 * (another Chrome profile, a phone) and then signs this window in.
 */
export function WaitForLink({ email }: { email: string }) {
  const [state, setState] = useState<"waiting" | "done" | "expired">("waiting");

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch("/api/auth/magic/status", { cache: "no-store" });
        const j = (await r.json()) as { status: "waiting" | "done" | "expired"; next: string | null };
        if (stop) return;
        if (j.status === "done") {
          setState("done");
          window.location.assign(j.next || "/");
          return;
        }
        if (j.status === "expired") {
          setState("expired");
          return;
        }
      } catch {
        /* network blip; keep trying */
      }
      timer = setTimeout(tick, document.visibilityState === "visible" ? 2000 : 6000);
    };
    tick();
    const onFocus = () => {
      clearTimeout(timer);
      tick();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      stop = true;
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (state === "done")
    return (
      <div className="mt-4 rounded-lg bg-ok-soft px-3 py-3 text-sm text-ok">
        <div className="font-medium">Signed in. Opening Orbit…</div>
      </div>
    );
  if (state === "expired")
    return (
      <div className="mt-4 rounded-lg bg-danger-soft px-3 py-3 text-sm text-danger">
        <div className="font-medium">That link has expired.</div>
        <div className="mt-0.5 opacity-90">
          <a href="/login" className="underline">
            Request a new one
          </a>
          .
        </div>
      </div>
    );
  return (
    <div className="mt-4 rounded-lg bg-ok-soft px-3 py-3 text-sm text-ok">
      <div className="flex items-center gap-2 font-medium">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" /> Check your email
      </div>
      <div className="mt-0.5 opacity-90">We sent a sign-in link to {email}. Click it anywhere, even on your phone or in another browser, and this window signs in by itself.</div>
      <div className="mt-2 text-xs opacity-75">The link works for 15 minutes. Keep this window open.</div>
    </div>
  );
}
