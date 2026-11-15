import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { trackerCompanies, trackerTasks, trackerComms, trackerConfig } from "@/db/schema";
import { ForbiddenError } from "@/lib/permissions";

type Doc = Record<string, unknown>;
const TABLES = { companies: trackerCompanies, tasks: trackerTasks, comms: trackerComms, config: trackerConfig } as const;
export type TrackerCollection = keyof typeof TABLES;
export const isCollection = (c: string): c is TrackerCollection => c in TABLES;
const CONFIG_KEYS = ["insurance", "settings", "scan"];
const MAX_DOC_BYTES = 900_000;

export type TrackerData = Record<TrackerCollection, Record<string, Doc>>;

/** Everything the tracker screens need, keyed the way the screens expect. */
export async function loadTracker(workspaceId: string): Promise<TrackerData> {
  const out = { companies: {}, tasks: {}, comms: {}, config: {} } as TrackerData;
  await Promise.all(
    (Object.keys(TABLES) as TrackerCollection[]).map(async (c) => {
      const rows = await db.select({ id: TABLES[c].id, data: TABLES[c].data }).from(TABLES[c]).where(eq(TABLES[c].workspaceId, workspaceId));
      for (const r of rows) out[c][r.id] = r.data;
    }),
  );
  return out;
}

const isPlain = (v: unknown): v is Doc => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * One write from the screens. "set" replaces the record, "update" merges top-level fields
 * (the same meaning the screens were written against), "delete" removes it.
 * Settings are narrower: alert settings and the insurance agent list need an admin.
 */
export async function writeTracker(workspaceId: string, userId: string, canAdmin: boolean, input: { collection: string; id: string; op: "set" | "update" | "delete"; data?: unknown }) {
  const { collection, id, op } = input;
  if (!isCollection(collection)) throw new Error("Unknown collection.");
  if (!/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(id)) throw new Error("Bad record id.");
  const table = TABLES[collection];
  const where = and(eq(table.workspaceId, workspaceId), eq(table.id, id));

  if (collection === "config") {
    if (!CONFIG_KEYS.includes(id)) throw new Error("Unknown setting.");
    if (op === "delete") throw new Error("Settings can't be deleted.");
    if (id === "settings" && !canAdmin) throw new ForbiddenError("Only owners and admins can change alert settings.");
  }
  if (op === "delete") {
    await db.delete(table).where(where);
    return;
  }
  if (!isPlain(input.data)) throw new Error("Nothing to save.");
  let data = input.data;
  if (JSON.stringify(data).length > MAX_DOC_BYTES) throw new Error("That record is too large to save.");

  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ data: table.data }).from(table).where(where).for("update");
    if (op === "update") {
      if (!existing) throw new Error("That record no longer exists.");
      data = { ...existing.data, ...data };
    }
    // Editors keep policies up to date; the agent list itself is an admin setting.
    if (collection === "config" && id === "insurance" && !canAdmin) {
      const before = (existing?.data as Doc | undefined)?.agents ?? [];
      if (JSON.stringify(data.agents ?? []) !== JSON.stringify(before)) throw new ForbiddenError("Only owners and admins can change insurance agents.");
    }
    if (existing) await tx.update(table).set({ data, updatedById: userId, updatedAt: new Date() }).where(where);
    else await tx.insert(table).values({ workspaceId, id, data, updatedById: userId });
  });
}

export type ImportPlan = { companies: Record<string, Doc>; tasks: Record<string, Doc>; comms: Record<string, Doc>; config: Record<string, Doc>; problems: string[] };

/** Accepts {id: record} maps or arrays of records carrying id / _id / doc_id. Reads nothing else in. */
function readCollection(v: unknown, name: string, problems: string[]): Record<string, Doc> {
  const out: Record<string, Doc> = {};
  if (v == null) return out;
  const put = (id: unknown, doc: unknown) => {
    if (typeof id !== "string" || !/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(id)) return problems.push(`${name}: skipped a record with no usable id`);
    if (!isPlain(doc)) return problems.push(`${name}/${id}: skipped, not a record`);
    const { id: _a, _id: _b, doc_id: _c, ...rest } = doc;
    out[id] = rest;
  };
  if (Array.isArray(v)) for (const d of v) put(isPlain(d) ? (d.id ?? d._id ?? d.doc_id) : undefined, d);
  else if (isPlain(v)) for (const [id, d] of Object.entries(v)) put(id, d);
  else problems.push(`${name}: not a list of records`);
  return out;
}

/** Checks an export file and says what it would bring in, without saving anything. */
export function planImport(json: unknown): ImportPlan {
  const problems: string[] = [];
  if (!isPlain(json)) return { companies: {}, tasks: {}, comms: {}, config: {}, problems: ["The file isn't a JSON object with companies, tasks and comms."] };
  const plan: ImportPlan = { companies: readCollection(json.companies, "companies", problems), tasks: readCollection(json.tasks, "tasks", problems), comms: readCollection(json.comms, "comms", problems), config: {}, problems };
  for (const [k, v] of Object.entries(readCollection(json.config, "config", problems))) {
    if (CONFIG_KEYS.includes(k)) plan.config[k] = v;
    else problems.push(`config/${k}: skipped, not a tracker setting`);
  }
  for (const [id, c] of Object.entries(plan.companies)) if (typeof c.name !== "string" || !c.name.trim()) problems.push(`companies/${id}: has no name`);
  for (const [id, t] of Object.entries(plan.tasks)) if (t.companyId && !plan.companies[String(t.companyId)]) problems.push(`tasks/${id}: its company isn't in the file`);
  for (const [id, m] of Object.entries(plan.comms)) if (m.companyId && !plan.companies[String(m.companyId)]) problems.push(`comms/${id}: its company isn't in the file`);
  return plan;
}

/** "merge" adds new records and overwrites ones with the same id; "replace" clears the tracker first. */
export async function runImport(workspaceId: string, userId: string, plan: ImportPlan, mode: "merge" | "replace") {
  await db.transaction(async (tx) => {
    for (const c of Object.keys(TABLES) as TrackerCollection[]) {
      const table = TABLES[c];
      if (mode === "replace") await tx.delete(table).where(eq(table.workspaceId, workspaceId));
      for (const [id, data] of Object.entries(plan[c])) {
        await tx
          .insert(table)
          .values({ workspaceId, id, data, updatedById: userId })
          .onConflictDoUpdate({ target: [table.workspaceId, table.id], set: { data, updatedById: userId, updatedAt: new Date() } });
      }
    }
  });
}
