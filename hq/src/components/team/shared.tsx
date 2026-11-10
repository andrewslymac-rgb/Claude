import type { Frequency } from "@/db/schema";

export const CAD_LABEL: Record<Frequency, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual", once: "One-off" };
export const CAD_SHORT: Record<Frequency, string> = { daily: "D", weekly: "W", monthly: "M", quarterly: "Q", annual: "A", once: "1×" };
export const CYCLE_WORD: Record<Frequency, string> = { daily: "today", weekly: "this week", monthly: "this month", quarterly: "this quarter", annual: "this year", once: "done" };

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 55% 48%)` }}>
      {initials}
    </span>
  );
}

/** Ring showing the on-track share. */
export function Ring({ pct, size = 56 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = pct >= 85 ? "var(--color-ok)" : pct >= 60 ? "var(--color-warn)" : "var(--color-danger)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={`${pct}% on track`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.26} fontWeight="700" fill="var(--color-ink)">
        {pct}%
      </text>
    </svg>
  );
}

/** done/total bar for one cadence; red slice for overdue. */
export function CadenceBar({ total, done, overdue }: { total: number; done: number; overdue: number }) {
  if (!total) return <div className="h-1.5 rounded-full bg-line/50" />;
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-line">
      <div className="bg-ok" style={{ width: `${(done / total) * 100}%` }} />
      <div className="bg-danger" style={{ width: `${(overdue / total) * 100}%` }} />
    </div>
  );
}
