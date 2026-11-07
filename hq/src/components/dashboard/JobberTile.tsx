"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, AlertCircle, CheckCircle2, Clock } from "lucide-react";

type Visit = { id: string; title: string; startAt: string; endAt: string | null; completed: boolean; client: string; address: string; assignees: string[] };
type Snapshot = { at: string; account: string | null; today: Visit[]; requestsNew: number; quotesAwaiting: { count: number; total: number }; invoicesPastDue: { count: number; total: number }; invoicesAwaiting: { count: number; total: number }; errors: string[] };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

export function JobberTile({ slug, connected, canManage }: { slug: string; connected: boolean; canManage: boolean }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (!connected) return;
      setBusy(true);
      try {
        const r = await fetch(`/api/w/${slug}/jobber${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Couldn't reach Jobber");
        setSnap(j);
        setErr("");
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [slug, connected],
  );

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!connected)
    return (
      <div className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-soft">
        <div className="font-medium text-ink">Jobber isn&apos;t connected yet.</div>
        <p className="mt-1">Connect it to see today&apos;s schedule, new requests, quotes waiting and overdue invoices right here.</p>
        {canManage && (
          <Link href={`/w/${slug}/settings?tab=integrations`} className="mt-3 inline-block rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-paper">
            Connect Jobber
          </Link>
        )}
      </div>
    );

  const s = snap;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Num label="Jobs today" value={s ? String(s.today.length) : "–"} sub={s ? `${s.today.filter((v) => v.completed).length} done` : ""} href="https://secure.getjobber.com/calendar" />
        <Num label="New requests" value={s ? String(s.requestsNew) : "–"} tone={s?.requestsNew ? "warn" : undefined} href="https://secure.getjobber.com/requests" />
        <Num label="Quotes waiting" value={s ? String(s.quotesAwaiting.count) : "–"} sub={s ? money(s.quotesAwaiting.total) : ""} href="https://secure.getjobber.com/quotes" />
        <Num label="Overdue invoices" value={s ? String(s.invoicesPastDue.count) : "–"} sub={s ? money(s.invoicesPastDue.total) : ""} tone={s?.invoicesPastDue.count ? "danger" : undefined} href="https://secure.getjobber.com/invoices" />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-ink-faint">
          <span>Today&apos;s schedule</span>
          <button onClick={() => load(true)} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover hover:text-ink" title="Refresh">
            <RefreshCw size={11} className={busy ? "animate-spin" : ""} /> {s ? `updated ${time(s.at)}` : "loading…"}
          </button>
        </div>
        {s && s.today.length === 0 && !err && <p className="text-sm text-ink-faint">No visits scheduled today.</p>}
        <ul className="max-h-64 space-y-1 overflow-y-auto scrollbar-thin">
          {s?.today.map((v) => (
            <li key={v.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover">
              {v.completed ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" /> : <Clock size={15} className="mt-0.5 shrink-0 text-ink-faint" />}
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  <span className="font-medium">{time(v.startAt)}</span> · {v.client || v.title}
                </div>
                <div className="truncate text-xs text-ink-faint">
                  {v.address}
                  {v.assignees.length ? ` · ${v.assignees.join(", ")}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {(err || s?.errors.length) && (
        <p className="mt-2 flex items-start gap-1 text-xs text-warn">
          <AlertCircle size={12} className="mt-0.5 shrink-0" /> {err || s?.errors.join(" · ")}
        </p>
      )}
    </div>
  );
}

function Num({ label, value, sub, tone, href }: { label: string; value: string; sub?: string; tone?: "warn" | "danger"; href: string }) {
  const color = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <a href={href} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-side px-3 py-2 hover:border-ink-faint">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-ink-faint">{sub}</div>}
    </a>
  );
}
