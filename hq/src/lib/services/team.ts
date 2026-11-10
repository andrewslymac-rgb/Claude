import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Frequency } from "@/db/schema";
import { addDays, todayISO } from "@/lib/recurrence";
import { listMembers } from "./members";
import { listTasks, type TaskRow } from "./tasks";

const { taskCompletions, memberRoles } = schema;

export const CADENCES: Frequency[] = ["daily", "weekly", "monthly", "quarterly", "annual", "once"];

/** First day of the current cycle for a cadence (weeks start Monday). */
export function cycleStart(freq: Frequency, today = todayISO()): string {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (freq) {
    case "daily":
      return today;
    case "weekly": {
      const dow = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7; // Mon = 0
      return addDays(today, -dow);
    }
    case "monthly":
      return `${y}-${pad(m)}-01`;
    case "quarterly":
      return `${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`;
    case "annual":
      return `${y}-01-01`;
    default:
      return "0000-01-01";
  }
}

export type Source = "direct" | "role" | "anyone";
export type PersonTask = TaskRow & { source: Source; doneThisCycle: boolean };
export type CadenceProgress = { freq: Frequency; total: number; done: number; overdue: number };
export type PersonSummary = {
  userId: string;
  name: string;
  email: string;
  role: string;
  jobRoles: { id: string; name: string; emoji: string; color: string }[];
  lastSeenAt: string | null;
  total: number;
  overdue: number;
  dueToday: number;
  doneThisWeek: number;
  done30: number;
  /** Share of recurring tasks done for their current cycle, or not yet due (0–100). */
  onTrack: number;
  cadences: CadenceProgress[];
};

function tasksFor(all: TaskRow[], userId: string, roleIds: string[], includeAnyone: boolean): PersonTask[] {
  const today = todayISO();
  const out: PersonTask[] = [];
  for (const t of all) {
    const source: Source | null = t.assignees.some((a) => a.id === userId) ? "direct" : t.roleId && roleIds.includes(t.roleId) ? "role" : includeAnyone && !t.roleId && t.assignees.length === 0 ? "anyone" : null;
    if (!source) continue;
    const doneThisCycle = Boolean(t.lastDoneOn && t.lastDoneOn >= cycleStart(t.frequency, today));
    out.push({ ...t, source, doneThisCycle });
  }
  return out;
}

function summarize(list: PersonTask[]) {
  const cadences = CADENCES.map((freq) => {
    const ts = list.filter((t) => t.frequency === freq);
    return { freq, total: ts.length, done: ts.filter((t) => t.doneThisCycle || t.state === "done").length, overdue: ts.filter((t) => t.state === "overdue").length };
  });
  const recurring = list.filter((t) => t.frequency !== "once");
  const onTrack = recurring.length ? Math.round((recurring.filter((t) => t.state !== "overdue").length / recurring.length) * 100) : 100;
  return {
    total: list.filter((t) => t.state !== "done").length,
    overdue: list.filter((t) => t.state === "overdue").length,
    dueToday: list.filter((t) => t.state === "today").length,
    onTrack,
    cadences,
  };
}

async function completionsSince(workspaceId: string, since: string, taskIds: string[]) {
  if (!taskIds.length) return [];
  return db
    .select({ taskId: taskCompletions.taskId, doneOn: taskCompletions.doneOn, doneById: taskCompletions.doneById })
    .from(taskCompletions)
    .where(and(inArray(taskCompletions.taskId, taskIds), gte(taskCompletions.doneOn, since)));
}

async function roleMap(workspaceId: string) {
  const rows = await db.select({ userId: memberRoles.userId, roleId: memberRoles.roleId }).from(memberRoles).where(eq(memberRoles.workspaceId, workspaceId));
  const m = new Map<string, string[]>();
  for (const r of rows) m.set(r.userId, [...(m.get(r.userId) ?? []), r.roleId]);
  return m;
}

/** One card per person: what they hold and how they're tracking. */
export async function teamOverview(workspaceId: string): Promise<PersonSummary[]> {
  const today = todayISO();
  const [{ members }, all, roles] = await Promise.all([listMembers(workspaceId), listTasks(workspaceId), roleMap(workspaceId)]);
  const comps = await completionsSince(workspaceId, addDays(today, -30), all.map((t) => t.id));
  const week = cycleStart("weekly", today);
  return members.map((m) => {
    const list = tasksFor(all, m.userId, roles.get(m.userId) ?? [], false);
    const mine = comps.filter((c) => c.doneById === m.userId);
    return {
      userId: m.userId,
      name: m.name ?? m.email,
      email: m.email,
      role: m.role,
      jobRoles: m.jobRoles,
      lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
      ...summarize(list),
      doneThisWeek: mine.filter((c) => c.doneOn >= week).length,
      done30: mine.length,
    };
  });
}

/** Everything for one person's page. */
export async function personDetail(workspaceId: string, userId: string) {
  const today = todayISO();
  const [{ members }, all, roles] = await Promise.all([listMembers(workspaceId), listTasks(workspaceId), roleMap(workspaceId)]);
  const m = members.find((x) => x.userId === userId);
  if (!m) return null;
  const roleIds = roles.get(userId) ?? [];
  const list = tasksFor(all, userId, roleIds, true);
  const since = addDays(today, -89);
  const comps = await completionsSince(workspaceId, since, all.map((t) => t.id));
  const mine = comps.filter((c) => c.doneById === userId);
  const byDay: Record<string, number> = {};
  for (const c of mine) byDay[c.doneOn] = (byDay[c.doneOn] ?? 0) + 1;
  const titles = new Map(all.map((t) => [t.id, t.title]));
  const recent = mine
    .sort((a, b) => (a.doneOn < b.doneOn ? 1 : -1))
    .slice(0, 25)
    .map((c) => ({ taskId: c.taskId, title: titles.get(c.taskId) ?? "Task", doneOn: c.doneOn }));
  const own = list.filter((t) => t.source !== "anyone");
  return {
    person: { userId, name: m.name ?? m.email, email: m.email, role: m.role, jobRoles: m.jobRoles, lastSeenAt: m.lastSeenAt?.toISOString() ?? null },
    tasks: list,
    summary: { ...summarize(own), doneThisWeek: mine.filter((c) => c.doneOn >= cycleStart("weekly", today)).length, done30: mine.filter((c) => c.doneOn >= addDays(today, -29)).length },
    byDay,
    recent,
    today,
  };
}
