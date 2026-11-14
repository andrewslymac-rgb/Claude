"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail } from "lucide-react";
import { sendUnlockCodeAction, verifyUnlockCodeAction } from "@/app/dash-actions";

/** Shown in place of any dashboard until the owner or admin enters the code emailed to them. */
export function UnlockGate({ slug, email }: { slug: string; email: string }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const send = () =>
    start(async () => {
      const r = await sendUnlockCodeAction(slug);
      if (r.ok) {
        setSent(true);
        setMsg({ text: r.message ?? "Code sent." });
      } else setMsg({ text: r.error, bad: true });
    });
  const verify = () =>
    start(async () => {
      setMsg({ text: "Checking…" });
      const r = await verifyUnlockCodeAction(slug, code);
      if (r.ok) router.refresh();
      else setMsg({ text: r.error, bad: true });
    });

  return (
    <div className="mx-auto max-w-sm px-4 py-12 md:py-20">
      <div className="card p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Lock size={22} />
        </div>
        <h1 className="text-lg font-semibold">Dashboards are locked</h1>
        <p className="mt-1 text-sm text-ink-soft">Only owners and admins can open them. We&apos;ll email a 6-digit code to {email}. It keeps them open on this device for 12 hours.</p>
        {!sent ? (
          <button onClick={send} disabled={busy} className="btn btn-primary mt-5 w-full">
            <Mail size={16} /> Email me a code
          </button>
        ) : (
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.replace(/\D/g, "").length === 6) verify();
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123456"
              aria-label="6-digit code"
              className="field text-center text-2xl tracking-[0.4em]"
            />
            <button type="submit" disabled={busy || code.length !== 6} className="btn btn-primary w-full">
              Open dashboards
            </button>
            <button type="button" onClick={send} disabled={busy} className="btn w-full">
              Send a new code
            </button>
          </form>
        )}
        {msg && <p className={`mt-3 text-sm ${msg.bad ? "text-danger" : "text-ink-soft"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
