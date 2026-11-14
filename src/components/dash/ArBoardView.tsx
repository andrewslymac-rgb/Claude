"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ExternalLink, Mail, MessageSquare, Phone, Receipt, RefreshCw, StickyNote, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { addArFollowupAction, deleteArFollowupAction } from "@/app/dash-actions";
import type { ArBoard } from "@/lib/dash/ar";
import type { FollowupView } from "@/lib/dash/ar";
import type { ArBucket, ArInvoice } from "@/lib/integrations/jobber-ar";

// Mirrors AR_BUCKETS in the server module (kept here so the client bundle doesn't import server code).
const BUCKETS: { key: ArBucket; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "d1_30", label: "1–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90", label: "90+ days" },
];
const TONE: Record<ArBucket, string> = { current: "text-ink-soft", d1_30: "text-warn", d31_60: "text-warn", d61_90: "text-danger", d90: "text-danger" };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const TZ = "America/Los_Angeles";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const nice = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "no due date");
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`;
};

export function ArBoardView({ slug, board, followups, signOff }: { slug: string; board: ArBoard; followups: FollowupView[]; signOff: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [filter, setFilter] = useState<ArBucket | "all" | "followup">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<ArInvoice | null>(null);
  const invoices = board.pull?.invoices ?? [];

  const notesBy = useMemo(() => {
    const m = new Map<string, FollowupView[]>();
    for (const f of followups) m.set(f.invoiceId, [...(m.get(f.invoiceId) ?? []), f]);
    return m;
  }, [followups]);
  const t = today();
  const followDue = (id: string) => {
    const latest = notesBy.get(id)?.[0];
    return Boolean(latest?.followUpOn && latest.followUpOn <= t);
  };

  const totals = useMemo(() => {
    const by = Object.fromEntries(BUCKETS.map((b) => [b.key, { count: 0, sum: 0 }])) as Record<ArBucket, { count: number; sum: number }>;
    for (const i of invoices) {
      by[i.bucket].count++;
      by[i.bucket].sum += i.balance;
    }
    const all = invoices.reduce((s, i) => s + i.balance, 0);
    const past = invoices.filter((i) => i.bucket !== "current");
    return { by, all, pastSum: past.reduce((s, i) => s + i.balance, 0), pastCount: past.length, due: invoices.filter((i) => followDue(i.id)).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, notesBy]);

  const shown = invoices.filter((i) => (filter === "all" ? true : filter === "followup" ? followDue(i.id) : i.bucket === filter));
  const refresh = () => startRefresh(() => router.replace(`/w/${slug}/dash/ar?refresh=1`, { scroll: false }));

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        eyebrow={<Link href={`/w/${slug}/dash`} className="hover:text-ink">Dashboards</Link>}
        title="AR chaser board"
        icon={<Receipt size={22} className="text-accent" />}
        subtitle="Every unpaid invoice in Jobber, oldest first. Reminders are drafts: nothing sends until you tap send on your phone."
        actions={
          board.connected ? (
            <button onClick={refresh} disabled={refreshing} className="btn btn-sm">
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
            </button>
          ) : null
        }
      />

      {!board.connected && (
        <div className="card p-5 text-sm">
          <div className="font-medium">Jobber isn&apos;t connected to Orbit yet</div>
          <p className="mt-1 text-ink-soft">This board reads Jobber directly, so it needs Orbit&apos;s own Jobber connection (not Claude&apos;s). An owner connects it in Settings → Integrations.</p>
          <Link href={`/w/${slug}/settings?tab=integrations`} className="btn btn-primary mt-3">Open Integrations</Link>
        </div>
      )}

      {board.error && (
        <div className="flex gap-2 rounded-xl border border-danger/40 bg-danger-soft p-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <div className="font-medium text-danger">Couldn&apos;t reach Jobber</div>
            <div className="text-ink-soft">{board.stale ? "Showing the last good pull below. " : ""}{board.error}</div>
          </div>
        </div>
      )}
      {board.pull?.warnings.map((w) => (
        <div key={w} className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{w}</div>
      ))}

      {board.pull && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total outstanding" value={money(totals.all)} sub={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`} active={filter === "all"} onClick={() => setFilter("all")} />
            <Stat label="Past due" value={money(totals.pastSum)} sub={`${totals.pastCount} invoice${totals.pastCount === 1 ? "" : "s"}`} tone={totals.pastCount ? "text-danger" : undefined} />
          </div>

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
            {BUCKETS.map((b) => (
              <Chip key={b.key} active={filter === b.key} onClick={() => setFilter(filter === b.key ? "all" : b.key)}>
                <span className={TONE[b.key]}>{b.label}</span>
                <span className="num font-semibold">{totals.by[b.key].count}</span>
              </Chip>
            ))}
            {totals.due > 0 && (
              <Chip active={filter === "followup"} onClick={() => setFilter(filter === "followup" ? "all" : "followup")}>
                <StickyNote size={13} className="text-accent" /> Follow up today <span className="num font-semibold">{totals.due}</span>
              </Chip>
            )}
          </div>

          <div className="text-xs text-ink-faint">
            {board.fetchedAt && <>Pulled from Jobber {ago(board.fetchedAt)}. Refreshes on its own every 10 minutes.</>}
          </div>

          {(filter === "all" ? BUCKETS : BUCKETS.filter((b) => b.key === filter || filter === "followup")).map((b) => {
            const rows = shown.filter((i) => i.bucket === b.key);
            if (!rows.length) return null;
            return (
              <section key={b.key}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className={`text-sm font-semibold ${TONE[b.key]}`}>{b.label}</h2>
                  <span className="num text-xs text-ink-soft">{rows.length} · {money(rows.reduce((s, i) => s + i.balance, 0))}</span>
                </div>
                <div className="space-y-2">
                  {rows.map((i) => (
                    <Row key={i.id} slug={slug} inv={i} notes={notesBy.get(i.id) ?? []} due={followDue(i.id)} open={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)} onDraft={() => setDraft(i)} />
                  ))}
                </div>
              </section>
            );
          })}
          {!shown.length && <p className="card px-4 py-8 text-center text-sm text-ink-soft">{invoices.length ? "Nothing in this group." : "No unpaid invoices. Everyone's paid up."}</p>}
        </>
      )}

      {draft && <ReminderDraft slug={slug} inv={draft} signOff={signOff} onClose={() => setDraft(null)} />}
    </div>
  );
}

function Stat({ label, value, sub, tone, active, onClick }: { label: string; value: string; sub: string; tone?: string; active?: boolean; onClick?: () => void }) {
  const C = onClick ? "button" : "div";
  return (
    <C onClick={onClick} className={`card p-4 text-left ${active ? "ring-1 ring-accent/50" : ""}`}>
      <div className="eyebrow">{label}</div>
      <div className={`num mt-1 text-xl font-semibold md:text-2xl ${tone ?? ""}`}>{value}</div>
      <div className="text-xs text-ink-soft">{sub}</div>
    </C>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm ${active ? "border-accent bg-accent-soft" : "border-line bg-card hover:bg-hover"}`}>
      {children}
    </button>
  );
}

function Row({ slug, inv, notes, due, open, onToggle, onDraft }: { slug: string; inv: ArInvoice; notes: FollowupView[]; due: boolean; open: boolean; onToggle: () => void; onDraft: () => void }) {
  const latest = notes[0];
  const telHref = inv.client.phone ? `tel:${inv.client.phone.replace(/[^\d+]/g, "")}` : null;
  return (
    <div className={`card overflow-hidden ${due ? "ring-1 ring-accent/60" : ""}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium">{inv.client.name}</span>
            <span className="num shrink-0 font-semibold">{money(inv.balance)}</span>
          </div>
          <div className="mt-0.5 text-xs text-ink-soft">
            #{inv.number} · due {nice(inv.dueOn)}
            {inv.daysPastDue > 0 && <span className={`font-medium ${TONE[inv.bucket]}`}> · {inv.daysPastDue} day{inv.daysPastDue === 1 ? "" : "s"} past due</span>}
            {inv.balance < inv.total - 0.005 && <> · partly paid of {money(inv.total)}</>}
          </div>
          {latest && (
            <div className={`mt-1.5 flex items-start gap-1 text-xs ${due ? "text-accent" : "text-ink-soft"}`}>
              <StickyNote size={12} className="mt-0.5 shrink-0" />
              <span className="min-w-0">
                {latest.note}
                {latest.followUpOn && <> · follow up {nice(latest.followUpOn)}</>} · {latest.by}
              </span>
            </div>
          )}
        </div>
        <ChevronDown size={16} className={`mt-1 shrink-0 text-ink-faint transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          <div className="space-y-1 text-sm">
            {inv.client.phone ? (
              <a href={telHref!} className="flex min-h-10 items-center gap-2 text-accent"><Phone size={15} /> {inv.client.phone}</a>
            ) : (
              <div className="flex items-center gap-2 text-ink-faint"><Phone size={15} /> No phone in Jobber</div>
            )}
            {inv.client.email ? (
              <a href={`mailto:${inv.client.email}`} className="flex min-h-10 items-center gap-2 break-all text-accent"><Mail size={15} /> {inv.client.email}</a>
            ) : (
              <div className="flex items-center gap-2 text-ink-faint"><Mail size={15} /> No email in Jobber</div>
            )}
            {inv.subject && <div className="text-xs text-ink-soft">{inv.subject}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onDraft} className="btn btn-primary btn-sm"><MessageSquare size={14} /> Draft reminder</button>
            <a href={inv.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm"><ExternalLink size={14} /> Open in Jobber</a>
          </div>
          <FollowupForm slug={slug} invoiceId={inv.id} />
          {notes.length > 0 && (
            <div className="space-y-1.5">
              <div className="eyebrow">Follow-up history</div>
              {notes.map((n) => (
                <NoteLine key={n.id} slug={slug} n={n} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NoteLine({ slug, n }: { slug: string; n: FollowupView }) {
  const [busy, start] = useTransition();
  const toast = useToast();
  return (
    <div className="flex items-start gap-2 text-sm">
      <div className="min-w-0 flex-1">
        <div>{n.note}</div>
        <div className="text-xs text-ink-faint">
          {n.by}, {new Date(n.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ })}
          {n.followUpOn && <> · follow up {nice(n.followUpOn)}</>}
        </div>
      </div>
      <button onClick={() => confirm("Delete this note?") && start(async () => { const r = await deleteArFollowupAction(slug, n.id); if (!r.ok) toast(r.error, false); })} disabled={busy} className="tap-icon rounded p-1.5 text-ink-faint hover:text-danger" aria-label="Delete note">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

const plusDays = (n: number) => {
  const d = new Date(`${today()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function FollowupForm({ slug, invoiceId, initial, onDone }: { slug: string; invoiceId: string; initial?: string; onDone?: () => void }) {
  const [note, setNote] = useState(initial ?? "");
  const [on, setOn] = useState(plusDays(3));
  const [busy, start] = useTransition();
  const toast = useToast();
  return (
    <form
      className="space-y-2 rounded-xl bg-hover/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addArFollowupAction(slug, invoiceId, note, on || null);
          if (!r.ok) return toast(r.error, false);
          setNote("");
          toast("Note saved");
          onDone?.();
        });
      }}
    >
      <div className="eyebrow">Add a follow-up note</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Texted reminder, said they'll pay Friday" maxLength={500} className="field" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          Follow up on
          <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="field w-auto py-1.5" />
        </label>
        <button type="submit" disabled={busy || !note.trim()} className="btn btn-sm ml-auto">Save note</button>
      </div>
    </form>
  );
}

function reminderText(inv: ArInvoice, signOff: string) {
  const hi = inv.client.firstName ? `Hi ${inv.client.firstName}` : "Hi there";
  const when = inv.dueOn ? (inv.daysPastDue > 0 ? `was due ${nice(inv.dueOn)}` : `is due ${nice(inv.dueOn)}`) : "is still open";
  return `${hi}, a friendly reminder that invoice #${inv.number} for ${money(inv.balance)} ${when}. You can pay from the link in your invoice email, or reply here with any questions. Thank you${signOff ? `, ${signOff}` : "!"}`;
}

/** Writes the message and hands it to the phone's own Messages or Mail app. Orbit never sends it. */
function ReminderDraft({ slug, inv, signOff, onClose }: { slug: string; inv: ArInvoice; signOff: string; onClose: () => void }) {
  const [text, setText] = useState(() => reminderText(inv, signOff));
  const [handed, setHanded] = useState<"text" | "email" | null>(null);
  const toast = useToast();
  const phone = inv.client.phone?.replace(/[^\d+]/g, "");
  const smsHref = phone ? `sms:${phone}?&body=${encodeURIComponent(text)}` : null;
  const mailHref = inv.client.email ? `mailto:${inv.client.email}?subject=${encodeURIComponent(`Invoice #${inv.number} reminder`)}&body=${encodeURIComponent(text)}` : null;
  return (
    <Modal title="Draft reminder" subtitle={`${inv.client.name} · #${inv.number} · ${money(inv.balance)}`} onClose={onClose}>
      <div className="space-y-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="field text-[15px] leading-relaxed" aria-label="Reminder message" />
        <p className="text-xs text-ink-soft">Edit freely. The buttons open your phone&apos;s Messages or Mail with this filled in. Nothing is sent until you tap send there.</p>
        <div className="grid grid-cols-2 gap-2">
          {smsHref ? (
            <a href={smsHref} onClick={() => setHanded("text")} className="btn btn-primary"><MessageSquare size={15} /> Text</a>
          ) : (
            <span className="btn opacity-50" title="No phone number in Jobber"><MessageSquare size={15} /> No phone</span>
          )}
          {mailHref ? (
            <a href={mailHref} onClick={() => setHanded("email")} className="btn btn-primary"><Mail size={15} /> Email</a>
          ) : (
            <span className="btn opacity-50" title="No email in Jobber"><Mail size={15} /> No email</span>
          )}
        </div>
        {phone && !inv.client.smsOk && <p className="text-xs text-warn">Jobber says this client hasn&apos;t opted in to texts. Email may be the better choice.</p>}
        <button onClick={() => navigator.clipboard?.writeText(text).then(() => toast("Copied"))} className="btn btn-sm w-full">Copy message</button>
        {handed && (
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-sm">Did you send it? Log it so everyone can see this client was contacted.</p>
            <FollowupForm slug={slug} invoiceId={inv.id} initial={`Sent reminder by ${handed}`} onDone={onClose} />
          </div>
        )}
      </div>
    </Modal>
  );
}
