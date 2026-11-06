import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import tasksJson from "@/db/imports/lemon-tasks.json";
import flagsJson from "@/db/imports/lemon-flags.json";
import { importTasks } from "./tasks";
import { createFlag } from "./flags";
import type { Frequency } from "@/db/schema";
import type { FlagSeverity, FlagType } from "@/lib/flag-labels";

/** One-time import of the Lemon and Lavender Notion tasks and open flags. Safe to re-run; skips titles that exist. */
export async function importLemonNotion(workspaceId: string, andrewUserId: string) {
  const tasks = (tasksJson as { title: string; frequency: Frequency; category: string | null; whenText: string | null; instructions: string; ownerRole: string | null; ownerIsAndrew: boolean }[]).map((t) => ({
    title: t.title,
    frequency: t.frequency,
    category: t.category,
    whenText: t.whenText,
    instructions: t.instructions,
    ownerRole: t.ownerRole,
    assigneeIds: t.ownerIsAndrew ? [andrewUserId] : [],
  }));
  const tasksAdded = await importTasks(workspaceId, tasks, andrewUserId);

  const existing = new Set((await db.select({ t: schema.flags.title }).from(schema.flags).where(eq(schema.flags.workspaceId, workspaceId))).map((r) => r.t.toLowerCase()));
  let flagsAdded = 0;
  for (const f of flagsJson as { title: string; type: FlagType; severity: FlagSeverity; whoDecides: string; whatWeFound: string; nextStep: string }[]) {
    if (existing.has(f.title.toLowerCase())) continue;
    await createFlag(workspaceId, { ...f, status: "open" }, andrewUserId);
    flagsAdded++;
  }
  return { tasksAdded, flagsAdded };
}
