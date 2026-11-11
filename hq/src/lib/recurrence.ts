/**
 * Date math for recurring tasks and document reviews. Works on plain
 * YYYY-MM-DD strings so there are no timezone surprises.
 */
import type { Frequency, ReviewCycle } from "@/db/schema";

export const TZ = "America/Los_Angeles";

/** Today's date in the company's timezone, as YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T00:00:00Z").getTime();
  const b = new Date(toISO + "T00:00:00Z").getTime();
  return Math.round((b - a) / 864e5);
}

/** Next due date after a task was done on `doneOn`. */
export function nextDueAfter(frequency: Frequency, doneOn: string): string | null {
  switch (frequency) {
    case "daily":
      return addDays(doneOn, 1);
    case "weekly":
      return addDays(doneOn, 7);
    case "monthly":
      return addMonths(doneOn, 1);
    case "quarterly":
      return addMonths(doneOn, 3);
    case "annual":
      return addMonths(doneOn, 12);
    case "once":
      return null;
  }
}

/**
 * Compute next due for a task from its frequency, optional fixed due date and
 * last completion. Never done + no due date = due today.
 */
export function computeNextDue(frequency: Frequency, dueOn: string | null, lastDoneOn: string | null, today = todayISO(), dueOverride: string | null = null): string | null {
  if (frequency === "once") return lastDoneOn ? null : dueOverride ?? dueOn ?? today;
  if (dueOverride && (!lastDoneOn || dueOverride > lastDoneOn)) return dueOverride;
  if (!lastDoneOn) return dueOn ?? today;
  return nextDueAfter(frequency, lastDoneOn);
}

/** First day of the current period for a frequency: today, this Monday, the 1st, quarter start, Jan 1. */
export function periodStart(frequency: Frequency, today = todayISO()): string {
  const [y, m, d] = today.split("-").map(Number);
  switch (frequency) {
    case "daily":
    case "once":
      return today;
    case "weekly": {
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
      return addDays(today, -((dow + 6) % 7));
    }
    case "monthly":
      return `${today.slice(0, 7)}-01`;
    case "quarterly":
      return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
    case "annual":
      return `${y}-01-01`;
  }
}

/** Was the task completed within the current period? Drives the tracker checkbox. */
export function doneThisPeriod(frequency: Frequency, lastDoneOn: string | null, today = todayISO()): boolean {
  if (!lastDoneOn) return false;
  if (frequency === "once") return true;
  return lastDoneOn >= periodStart(frequency, today);
}

export const PERIOD_LABELS: Record<Frequency, string> = { daily: "today", weekly: "this week", monthly: "this month", quarterly: "this quarter", annual: "this year", once: "" };

export type DueState = "overdue" | "today" | "soon" | "later" | "done";

export function dueState(nextDueOn: string | null, today = todayISO()): DueState {
  if (!nextDueOn) return "done";
  const d = daysBetween(today, nextDueOn);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "soon";
  return "later";
}

export const DUE_LABELS: Record<DueState, { label: string; tone: "danger" | "warn" | "accent" | "muted" | "ok" }> = {
  overdue: { label: "Overdue", tone: "danger" },
  today: { label: "Due today", tone: "warn" },
  soon: { label: "Due soon", tone: "accent" },
  later: { label: "Scheduled", tone: "muted" },
  done: { label: "Done", tone: "ok" },
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  once: "One-off",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

// --- Document reviews -------------------------------------------------------

/** Review cadences line up with the task tracker's: weekly, monthly, quarterly, annual (plus every 6 months). */
export const REVIEW_CYCLE_LABELS: Record<ReviewCycle, string> = { weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", semiannual: "Every 6 months", annual: "Annual" };

export function nextReviewOn(cycle: ReviewCycle | null, lastReviewedOn: string | null): string | null {
  if (!cycle || !lastReviewedOn) return null;
  if (cycle === "weekly") return addDays(lastReviewedOn, 7);
  return addMonths(lastReviewedOn, { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[cycle]);
}

export type ReviewState = "first" | "overdue" | "due_soon" | "current" | "none";

export function reviewState(cycle: ReviewCycle | null, lastReviewedOn: string | null, today = todayISO()): ReviewState {
  if (!cycle) return "none";
  if (!lastReviewedOn) return "first";
  const next = nextReviewOn(cycle, lastReviewedOn)!;
  const d = daysBetween(today, next);
  if (d < 0) return "overdue";
  const soon = cycle === "weekly" ? 2 : cycle === "monthly" ? 7 : 30;
  if (d <= soon) return "due_soon";
  return "current";
}

export const REVIEW_LABELS: Record<ReviewState, { label: string; tone: "danger" | "warn" | "accent" | "muted" | "ok" }> = {
  first: { label: "Needs first review", tone: "warn" },
  overdue: { label: "Review overdue", tone: "danger" },
  due_soon: { label: "Review due soon", tone: "accent" },
  current: { label: "Current", tone: "ok" },
  none: { label: "No review cycle", tone: "muted" },
};

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: y === new Date().getFullYear() ? undefined : "numeric", timeZone: "UTC" });
}
