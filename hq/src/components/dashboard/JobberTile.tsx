"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import type { FieldTool } from "@/db/schema";
import { FIELD_TOOL_INFO } from "@/lib/field-tools";

type Visit = { id: string; title: string; startAt: string; endAt: string | null; completed: boolean; client: string; address: string; assignees: string[] };
type Snapshot = { at: string; account: string | null; note?: string; today: Visit[]; requestsNew: number; quotesAwaiting: { count: number; total: number }; invoicesPastDue: { count: number; total: number }; invoicesAwaiting: { count: number; total: number }; errors: string[] };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

export function JobberTile({ slug, fieldTool, connected, manual, canManage }: { slug: string; fieldTool: FieldTool; connected: boolean; manual?: boolean; canManage: boolean }) {
  const tool = FIELD_TOOL_INFO[fieldTool];
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

  if (fieldTool === "none")
    return (
      <div className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-soft">
        <div className="font-medium text-ink">No field-service software set for this company.</div>
        <p className="mt-1">Pick Jobber or GorillaDesk under Settings → Workspace, or remove this tile.</p>
        {canManage && (
          <Link href={`/w/${slug}/settings?tab=workspace`} className="mt-3 inline-block btn btn-primary btn-sm">
            Open workspace settings
          </Link>
        )}
      </div>
    );

  if (!connected)
    return (
      <div className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-soft">
        <div className="font-medium text-ink">No {tool.label} numbers yet.</div>
        <p className="mt-1">Once Claude&apos;s daily update runs, today&apos;s schedule, {tool.words.requests.toLowerCase()}, {tool.words.quotes.toLowerCase()} and overdue invoices show up right here.</p>
        {canManage && (
          <Link href={`/w/${slug}/settings?tab=integrations`} className="mt-3 inline-block btn btn-primary btn-sm">
            Set up the daily update
          </Link>
        )}
      </div>
    );

  const s = snap;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Num label={tool.words.visits} value={s ? String(s.today.length) : "–"} sub={s ? `${s.today.filter((v) => v.completed).length} done` : ""} href={tool.links.schedule} />
        <Num label={tool.words.requests} value={s ? String(s.requestsNew) : "–"} tone={s?.requestsNew ? "warn" : undefined} href={tool.links.requests} />
        <Num label={tool.words.quotes} value={s ? String(s.quotesAwaiting.count) : "–"} sub={s ? money(s.quotesAwaiting.total) : ""} href={tool.links.quotes} />
        <Num label="Overdue invoices" value={s ? String(s.invoicesPastDue.count) : "–"} sub={s ? money(s.invoicesPastDue.total) : ""} tone={s?.invoicesPastDue.count ? "danger" : undefined} href={tool.links.invoices} />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-ink-faint">
          <span>Today&apos;s schedule</span>
          <button onClick={() => load(true)} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover hover:text-ink" title="Refresh">
            <RefreshCw size={11} className={busy ? "animate-spin" : ""} /> {s ? (manual ? `${s.account ?? "Claude"} · ${new Date(s.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}` : `updated ${time(s.at)}`) : "loading…"}
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
      {(err || (s?.errors.length ?? 0) > 0) && (
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
