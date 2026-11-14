import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, nextDueAfter, todayISO } from "@/lib/recurrence";
import { listTasks, roleIdsFor, tasksForUser, type TaskRow } from "./tasks";

const { taskCompletions, users } = schema;

export type CalItem = { taskId: string; title: string; date: string; kind: "overdue" | "due" | "upcoming" | "done"; frequency: TaskRow["frequency"]; who: string | null };
export type CalData = { from: string; to: string; today: string; items: CalItem[]; daily: { taskId: string; title: string; who: string | null }[]; onHold: { taskId: string; title: string }[] };

const whoOf = (t: TaskRow) => t.assignees.map((a) => a.name.split(" ")[0]).join(", ") || (t.role ? `${t.role.emoji} ${t.role.name}` : t.ownerRole) || null;

/**
 * A month of one person's tasks (or everyone's). The next due date is real; dates after that
 * are projected from the schedule, assuming each is done on time. Daily tasks are listed once
 * instead of on every square, and past days show what was actually completed.
 */
export async function taskCalendar(workspaceId: string, personId: string | null, from: string, to: string): Promise<CalData> {
  const all = await listTasks(workspaceId);
  const mine = personId ? tasksForUser(all, personId, await roleIdsFor(workspaceId, personId)) : all;
  const today = todayISO();
  const items: CalItem[] = [];
  const daily: CalData["daily"] = [];
  const onHold: CalData["onHold"] = [];

  for (const t of mine) {
    if (t.pausedAt) {
      onHold.push({ taskId: t.id, title: t.title });
      continue;
    }
    if (!t.nextDueOn) continue; // a one-off that's done
    const who = whoOf(t);
    if (t.frequency === "daily") {
      daily.push({ taskId: t.id, title: t.title, who });
      if (t.nextDueOn < today && t.nextDueOn >= from) items.push({ taskId: t.id, title: t.title, date: t.nextDueOn, kind: "overdue", frequency: t.frequency, who });
      continue;
    }
    let d: string | null = t.nextDueOn;
    let first = true;
    for (let guard = 0; d && d <= to && guard < 400; guard++) {
      if (d >= from && (first || d >= today)) items.push({ taskId: t.id, title: t.title, date: d, kind: first ? (d < today ? "overdue" : "due") : "upcoming", frequency: t.frequency, who });
      if (t.frequency === "once") break;
      d = nextDueAfter(t.frequency, d);
      first = false;
    }
  }

  // What actually got done in the window (only up to today).
  const ids = mine.map((t) => t.id);
  if (ids.length && from <= today) {
    const titles = new Map(mine.map((t) => [t.id, t]));
    const done = await db
      .select({ taskId: taskCompletions.taskId, doneOn: taskCompletions.doneOn, by: users.name })
      .from(taskCompletions)
      .leftJoin(users, eq(users.id, taskCompletions.doneById))
      .where(and(inArray(taskCompletions.taskId, ids), gte(taskCompletions.doneOn, from), lte(taskCompletions.doneOn, to < today ? to : today)));
    for (const c of done) {
      const t = titles.get(c.taskId)!;
      // Daily tasks done every day would bury the calendar; their ticks show on the day list only.
      items.push({ taskId: c.taskId, title: t.title, date: c.doneOn, kind: "done", frequency: t.frequency, who: c.by?.split(" ")[0] ?? null });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
  return { from, to, today, items, daily, onHold };
}

/** First and last day of the month containing `ym` (YYYY-MM), padded out to whole Monday–Sunday weeks. */
export function monthGrid(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const first = `${ym}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const dowFirst = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const dowLast = (new Date(Date.UTC(y, m, 0)).getUTCDay() + 6) % 7;
  return { first, last, gridFrom: addDays(first, -dowFirst), gridTo: addDays(last, 6 - dowLast) };
}
