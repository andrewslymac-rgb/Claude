import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Meeting, MeetingNextStep } from "@/db/schema";
import { exportDocMarkdown, getFile, listChildren, FOLDER, GDOC, SHORTCUT, driveEnabled, type DriveFile } from "@/lib/drive/client";
import { folderIdFrom } from "@/lib/drive/sync";
import { getSetting, setSetting } from "@/lib/services/app-settings";
import { parseGeminiMarkdown } from "./parse";
import { createTask } from "@/lib/services/tasks";
import { addDays, todayISO } from "@/lib/recurrence";

const { meetingSources, meetings, workspaces, meetingPeople, tasks } = schema;

/** Gemini note docs only, so other files in a recordings folder are ignored. */
const isNotes = (name: string) => /notes by gemini/i.test(name);

// ---------------------------------------------------------------- who can see what

/**
 * Owners and admins see every meeting. Everyone else sees only the meeting types an admin
 * has shared with the team (e.g. "Adapt Weekly Admin Meeting"), never payroll or interviews by default.
 */
const sharedKey = (ws: string) => `meetings_shared:${ws}`;
export async function sharedSeries(workspaceId: string): Promise<string[]> {
  try {
    return JSON.parse((await getSetting(sharedKey(workspaceId))) ?? "[]");
  } catch {
    return [];
  }
}
export async function setSeriesShared(workspaceId: string, series: string, shared: boolean) {
  const cur = new Set(await sharedSeries(workspaceId));
  if (shared) cur.add(series);
  else cur.delete(series);
  await setSetting(sharedKey(workspaceId), JSON.stringify([...cur]));
}

export async function listMeetings(workspaceId: string, seeAll: boolean): Promise<Meeting[]> {
  if (seeAll) return db.select().from(meetings).where(eq(meetings.workspaceId, workspaceId)).orderBy(desc(meetings.occurredAt));
  const shared = await sharedSeries(workspaceId);
  if (!shared.length) return [];
  return db.select().from(meetings).where(and(eq(meetings.workspaceId, workspaceId), inArray(meetings.series, shared))).orderBy(desc(meetings.occurredAt));
}

export async function getMeeting(workspaceId: string, id: string, seeAll: boolean) {
  const [m] = await db.select().from(meetings).where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, id)));
  if (!m) return null;
  if (!seeAll && !(await sharedSeries(workspaceId)).includes(m.series)) return null;
  return m;
}

// ---------------------------------------------------------------- sources

export async function listSources(workspaceId: string) {
  return db.select().from(meetingSources).where(eq(meetingSources.workspaceId, workspaceId)).orderBy(meetingSources.createdAt);
}

export async function addSource(workspaceId: string, link: string, label: string) {
  const folderId = folderIdFrom(link);
  if (!folderId) throw new Error("Paste the link to a Google Drive folder (it has /folders/ in it).");
  if (!(await driveEnabled())) throw new Error("Google Drive isn't connected to Orbit yet (Settings → Documents & sync).");
  let name = label;
  try {
    const f = await getFile(folderId);
    if (f.mimeType !== FOLDER) throw new Error("That link is a file, not a folder.");
    name = label || f.name;
  } catch (e) {
    const msg = (e as Error).message;
    if (/404|not found/i.test(msg)) throw new Error("Orbit can't see that folder yet. Share it with Orbit's Drive address (shown on this page) as Viewer, then try again.");
    throw e;
  }
  const existing = (await listSources(workspaceId)).find((s) => s.folderId === folderId);
  if (existing) throw new Error("That folder is already connected.");
  const [row] = await db.insert(meetingSources).values({ workspaceId, folderId, label: name.slice(0, 80) }).returning();
  return row;
}

export async function removeSource(workspaceId: string, id: string) {
  await db.delete(meetingSources).where(and(eq(meetingSources.workspaceId, workspaceId), eq(meetingSources.id, id)));
  // Meetings that came only from that folder go with it; the docs in Drive are untouched.
  await db.delete(meetings).where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.sourceId, id)));
}

// ---------------------------------------------------------------- sync

type Found = { id: string; name: string; modifiedTime: string; url: string };

/** Notes docs in a folder and its subfolders (two levels), following shortcuts to the real doc. */
async function findNotes(folderId: string, depth = 0, seen = new Set<string>()): Promise<{ found: Found[]; unreadable: number }> {
  if (seen.has(folderId) || depth > 2) return { found: [], unreadable: 0 };
  seen.add(folderId);
  const out: Found[] = [];
  let unreadable = 0;
  const kids: (DriveFile & { shortcutDetails?: { targetId: string; targetMimeType: string } })[] = await listChildren(folderId);
  for (const k of kids) {
    if (k.mimeType === FOLDER) {
      const r = await findNotes(k.id, depth + 1, seen);
      out.push(...r.found);
      unreadable += r.unreadable;
    } else if (k.mimeType === GDOC && isNotes(k.name)) {
      out.push({ id: k.id, name: k.name, modifiedTime: k.modifiedTime, url: k.webViewLink ?? `https://docs.google.com/document/d/${k.id}/edit` });
    } else if (k.mimeType === SHORTCUT && k.shortcutDetails?.targetMimeType === GDOC && isNotes(k.name)) {
      try {
        const t = await getFile(k.shortcutDetails.targetId);
        out.push({ id: t.id, name: t.name, modifiedTime: t.modifiedTime, url: t.webViewLink ?? `https://docs.google.com/document/d/${t.id}/edit` });
      } catch {
        unreadable++; // the original lives in someone else's Drive that isn't shared with Orbit
      }
    }
  }
  return { found: out, unreadable };
}

export type MeetingSyncResult = { added: number; updated: number; removed: number; unreadable: number; tasksMade: number; errors: string[] };

/** Reads every connected folder for one company. Only docs that changed since last time are re-read. */
export async function syncMeetings(workspaceId: string): Promise<MeetingSyncResult> {
  const res: MeetingSyncResult = { added: 0, updated: 0, removed: 0, unreadable: 0, tasksMade: 0, errors: [] };
  if (!(await driveEnabled())) return { ...res, errors: ["Google Drive isn't connected to Orbit."] };
  const sources = await listSources(workspaceId);
  const existing = new Map((await db.select({ id: meetings.id, driveFileId: meetings.driveFileId, driveModifiedAt: meetings.driveModifiedAt }).from(meetings).where(eq(meetings.workspaceId, workspaceId))).map((m) => [m.driveFileId, m]));
  const seenIds = new Set<string>();
  let allOk = true;

  for (const src of sources) {
    try {
      const { found, unreadable } = await findNotes(src.folderId);
      res.unreadable += unreadable;
      for (const f of found) {
        if (seenIds.has(f.id)) continue;
        seenIds.add(f.id);
        const prev = existing.get(f.id);
        if (prev?.driveModifiedAt && prev.driveModifiedAt.toISOString() === new Date(f.modifiedTime).toISOString()) continue;
        try {
          const md = await exportDocMarkdown(f.id);
          const p = parseGeminiMarkdown(f.name, md);
          const values = {
            workspaceId,
            sourceId: src.id,
            driveFileId: f.id,
            docUrl: f.url,
            fileName: f.name,
            series: p.series.slice(0, 120),
            occurredAt: new Date(p.occurredAt ?? f.modifiedTime),
            attendees: p.attendees,
            summary: p.summary,
            summaryPoints: p.summaryPoints,
            decisions: p.decisions,
            nextSteps: p.nextSteps as MeetingNextStep[],
            topics: p.topics,
            recognised: p.recognised,
            driveModifiedAt: new Date(f.modifiedTime),
            syncedAt: new Date(),
          };
          if (prev) {
            // Keep any "made into a task" links on next steps that haven't changed.
            const [old] = await db.select({ nextSteps: meetings.nextSteps }).from(meetings).where(eq(meetings.id, prev.id));
            values.nextSteps = values.nextSteps.map((n) => {
              const o = old?.nextSteps.find((x) => x.title === n.title && x.owner === n.owner);
              return { ...n, taskId: o?.taskId ?? null, doneAt: o?.doneAt ?? null };
            });
            await db.update(meetings).set(values).where(eq(meetings.id, prev.id));
            res.updated++;
            res.tasksMade += await autoCreateFor(prev.id);
          } else {
            const [row] = await db.insert(meetings).values(values).onConflictDoNothing().returning({ id: meetings.id });
            res.added++;
            if (row) res.tasksMade += await autoCreateFor(row.id);
          }
        } catch (e) {
          res.errors.push(`${f.name}: ${(e as Error).message.slice(0, 120)}`);
        }
      }
      await db.update(meetingSources).set({ lastSyncedAt: new Date(), lastError: unreadable ? `${unreadable} meeting doc${unreadable === 1 ? " is" : "s are"} shortcuts to someone else's Drive that isn't shared with Orbit.` : null }).where(eq(meetingSources.id, src.id));
    } catch (e) {
      allOk = false;
      const msg = /404|not found/i.test((e as Error).message) ? "Orbit can't see this folder. Share it with Orbit's Drive address as Viewer." : (e as Error).message.slice(0, 200);
      res.errors.push(`${src.label}: ${msg}`);
      await db.update(meetingSources).set({ lastError: msg }).where(eq(meetingSources.id, src.id));
    }
  }
  // Docs that disappeared from every connected folder are dropped, but only after a clean full pass.
  if (allOk && sources.length) {
    const gone = [...existing.keys()].filter((id) => !seenIds.has(id));
    if (gone.length) {
      await db.delete(meetings).where(and(eq(meetings.workspaceId, workspaceId), inArray(meetings.driveFileId, gone)));
      res.removed = gone.length;
    }
  } else if (!sources.length) {
    await db.delete(meetings).where(eq(meetings.workspaceId, workspaceId));
  }
  return res;
}

let running = false;
/** Background job: every company with a connected folder. */
export async function syncAllMeetings() {
  if (running) return;
  running = true;
  try {
    const ws = await db.selectDistinct({ id: meetingSources.workspaceId }).from(meetingSources).innerJoin(workspaces, eq(workspaces.id, meetingSources.workspaceId));
    for (const w of ws) await syncMeetings(w.id).catch((e) => console.error("Meeting sync failed", e));
  } finally {
    running = false;
  }
}

// ---------------------------------------------------------------- next step → task

/** Turns one next step into a one-off task, assigned to the matched person if there is one. */
export async function nextStepToTask(workspaceId: string, meetingId: string, index: number, userId: string) {
  const [m] = await db.select().from(meetings).where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, meetingId)));
  if (!m) throw new Error("Meeting not found.");
  const step = m.nextSteps[index];
  if (!step) throw new Error("That next step no longer exists. The notes may have changed.");
  if (step.taskId) {
    const [t] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, step.taskId), isNull(tasks.archivedAt)));
    if (t) return t.id;
  }
  const taskId = await makeTask(m, index, userId, await peopleMap(workspaceId));
  const next = m.nextSteps.map((s, i) => (i === index ? { ...s, taskId } : s));
  await db.update(meetings).set({ nextSteps: next }).where(eq(meetings.id, m.id));
  return taskId;
}

// ---------------------------------------------------------------- labels, people, automatic tasks

/** "Google Meet · Adapt Weekly Admin Meeting · Fri, Nov 13 at 8:55 AM" */
export function meetingLabel(m: Pick<Meeting, "series" | "occurredAt">) {
  const when = m.occurredAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).replace(/, (\d+:\d+)/, " at $1");
  return `Google Meet · ${m.series} · ${when}`;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Names used in the notes → Orbit person (or null for "not on the team"). */
export async function peopleMap(workspaceId: string) {
  const rows = await db.select().from(meetingPeople).where(eq(meetingPeople.workspaceId, workspaceId));
  return new Map(rows.map((r) => [r.alias, r.userId]));
}

/** Every name that appears as an attendee or next-step owner, with how often. */
export async function namesInMeetings(workspaceId: string) {
  const ms = await db.select({ attendees: meetings.attendees, nextSteps: meetings.nextSteps }).from(meetings).where(eq(meetings.workspaceId, workspaceId));
  const count = new Map<string, { name: string; steps: number }>();
  for (const m of ms) {
    for (const a of m.attendees) if (!count.has(norm(a))) count.set(norm(a), { name: a, steps: 0 });
    for (const n of m.nextSteps) if (n.owner) {
      const k = norm(n.owner);
      count.set(k, { name: count.get(k)?.name ?? n.owner, steps: (count.get(k)?.steps ?? 0) + 1 });
    }
  }
  return [...count.entries()].map(([alias, v]) => ({ alias, ...v })).sort((a, b) => b.steps - a.steps || a.name.localeCompare(b.name));
}

/** userId: a person; null: not on the team; undefined: forget the match. */
export async function setPersonFor(workspaceId: string, name: string, userId: string | null | undefined) {
  const alias = norm(name);
  if (userId === undefined) {
    await db.delete(meetingPeople).where(and(eq(meetingPeople.workspaceId, workspaceId), eq(meetingPeople.alias, alias)));
    return;
  }
  await db.insert(meetingPeople).values({ workspaceId, alias, userId }).onConflictDoUpdate({ target: [meetingPeople.workspaceId, meetingPeople.alias], set: { userId } });
}

const autoKey = (ws: string) => `meetings_autotasks:${ws}`;
/** The date automatic tasks were switched on (only meetings on or after it get tasks), or null when off. */
export async function autoTasksFrom(workspaceId: string) {
  return (await getSetting(autoKey(workspaceId))) || null;
}
export async function setAutoTasks(workspaceId: string, on: boolean) {
  await setSetting(autoKey(workspaceId), on ? new Date().toISOString() : null);
}

/** Creates the task for one next step, assigned to the matched person, labelled with the meeting. */
async function makeTask(m: Meeting, index: number, createdById: string, people: Map<string, string | null>) {
  const step = m.nextSteps[index];
  const userId = step.owner ? people.get(norm(step.owner)) ?? null : null;
  const label = meetingLabel(m);
  const t = await createTask(
    m.workspaceId,
    {
      title: step.title.slice(0, 200),
      frequency: "once",
      instructions: [step.text, step.owner ? `Named in the meeting: ${step.owner}.` : "", `From ${label}`, `Full notes: ${m.docUrl}`].filter(Boolean).join("\n\n"),
      dueOn: addDays(todayISO(), 3),
      assigneeIds: userId ? [userId] : [],
    },
    createdById,
    { source: { meetingId: m.id, label } },
  );
  return t.id;
}

/** After a sync: new meetings (on or after the switch-on date) get tasks for next steps with a matched person. */
export async function autoCreateFor(meetingId: string) {
  const [m] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!m) return 0;
  const from = await autoTasksFrom(m.workspaceId);
  if (!from || m.occurredAt < new Date(from)) return 0;
  const people = await peopleMap(m.workspaceId);
  // Tasks need a creator; use the company's first owner.
  const [owner] = await db.select({ id: schema.memberships.userId }).from(schema.memberships).where(and(eq(schema.memberships.workspaceId, m.workspaceId), eq(schema.memberships.role, "owner"))).limit(1);
  if (!owner) return 0;
  let made = 0;
  const next = [...m.nextSteps];
  for (let i = 0; i < next.length; i++) {
    const s = next[i];
    if (s.taskId || s.doneAt || !s.owner || !people.get(norm(s.owner))) continue;
    next[i] = { ...s, taskId: await makeTask({ ...m, nextSteps: next }, i, owner.id, people) };
    made++;
  }
  if (made) await db.update(meetings).set({ nextSteps: next }).where(eq(meetings.id, m.id));
  return made;
}

// ---------------------------------------------------------------- next-step status

export type StepStatus = { status: "open" | "task" | "done"; taskDue?: string | null; taskOverdue?: boolean; taskRemoved?: boolean };

/** Open (nobody has it), a live task (with its due date), or done (task done, or marked done here). */
export async function stepStatuses(list: Meeting[]): Promise<Map<string, StepStatus[]>> {
  const ids = [...new Set(list.flatMap((m) => m.nextSteps.map((n) => n.taskId).filter(Boolean) as string[]))];
  const rows = ids.length ? await db.select({ id: tasks.id, nextDueOn: tasks.nextDueOn, lastDoneOn: tasks.lastDoneOn, archivedAt: tasks.archivedAt }).from(tasks).where(inArray(tasks.id, ids)) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const today = todayISO();
  const out = new Map<string, StepStatus[]>();
  for (const m of list) {
    out.set(
      m.id,
      m.nextSteps.map((n) => {
        if (n.doneAt) return { status: "done" };
        if (!n.taskId) return { status: "open" };
        const t = byId.get(n.taskId);
        if (!t || t.archivedAt) return { status: "open", taskRemoved: true };
        if (t.lastDoneOn && !t.nextDueOn) return { status: "done" };
        return { status: "task", taskDue: t.nextDueOn, taskOverdue: Boolean(t.nextDueOn && t.nextDueOn < today) };
      }),
    );
  }
  return out;
}

/** Mark a next step done (or open again) without making a task. */
export async function setStepDone(workspaceId: string, meetingId: string, index: number, done: boolean) {
  const [m] = await db.select().from(meetings).where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, meetingId)));
  if (!m || !m.nextSteps[index]) throw new Error("That next step no longer exists.");
  const next = m.nextSteps.map((s, i) => (i === index ? { ...s, doneAt: done ? new Date().toISOString() : null } : s));
  await db.update(meetings).set({ nextSteps: next }).where(eq(meetings.id, m.id));
}
