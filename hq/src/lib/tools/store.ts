import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { trackerCompanies, trackerTasks, trackerComms, trackerConfig, coiHolders, coiRequests, coiConfig, mfQuotes, mfConfig } from "@/db/schema";
import { ForbiddenError } from "@/lib/permissions";
import type { AppId } from "./apps";

type Doc = Record<string, unknown>;
type Table = typeof trackerCompanies;
type Guard = (w: { id: string; data: Doc; existing: Doc | undefined }) => void;

/**
 * What each built-in tool stores. Every tool keeps its settings in a "config" collection;
 * keys in adminConfig can only be changed by owners and admins.
 */
type AppDef = {
  file: string;
  tables: Record<string, Table>;
  labels: Record<string, string>;
  configKeys: string[];
  adminConfig: string[];
  /** Extra rule for editors (not admins) writing a config record. */
  editorConfigGuard?: Guard;
  /** Sanity checks on an import file. */
  checkImport?: (plan: Record<string, Record<string, Doc>>, problems: string[]) => void;
  /** Loaded once into an empty tool: { collection, file under tools-src }. */
  seed?: { collection: string; file: string };
};

const DEFS: Record<AppId, AppDef> = {
  tracker: {
    file: "tracker.html",
    tables: { companies: trackerCompanies, tasks: trackerTasks, comms: trackerComms, config: trackerConfig },
    labels: { companies: "companies", tasks: "to-dos and waiting items", comms: "communication log entries" },
    configKeys: ["insurance", "settings", "scan"],
    adminConfig: ["settings"],
    // Editors keep policies up to date; the agent list itself is an admin setting.
    editorConfigGuard: ({ id, data, existing }) => {
      if (id === "insurance" && JSON.stringify(data.agents ?? []) !== JSON.stringify(existing?.agents ?? [])) throw new ForbiddenError("Only owners and admins can change insurance agents.");
    },
    checkImport: (plan, problems) => {
      for (const [id, c] of Object.entries(plan.companies)) if (typeof c.name !== "string" || !c.name.trim()) problems.push(`companies/${id}: has no name`);
      for (const [id, t] of Object.entries(plan.tasks)) if (t.companyId && !plan.companies[String(t.companyId)]) problems.push(`tasks/${id}: its company isn't in the file`);
      for (const [id, m] of Object.entries(plan.comms)) if (m.companyId && !plan.companies[String(m.companyId)]) problems.push(`comms/${id}: its company isn't in the file`);
    },
  },
  coi: {
    file: "coi.html",
    tables: { holders: coiHolders, requests: coiRequests, config: coiConfig },
    labels: { holders: "certificate holders", requests: "logged requests" },
    configKeys: ["agents"],
    adminConfig: ["agents"],
    checkImport: (plan, problems) => {
      for (const [id, h] of Object.entries(plan.holders)) if (typeof h.name !== "string" || !h.name.trim()) problems.push(`holders/${id}: has no name`);
    },
    seed: { collection: "holders", file: "coi-holders-seed.json" },
  },
  quotes: {
    file: "quotes.html",
    tables: { quotes: mfQuotes, config: mfConfig },
    labels: { quotes: "saved quotes" },
    configKeys: ["pricelist"],
    adminConfig: ["pricelist"],
  },
};
export const appDef = (app: AppId) => DEFS[app];

const ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const SEEDED = "_seeded"; // marker row in the config table; never shown to or written by the screens
const MAX_DOC_BYTES = 900_000;
const isPlain = (v: unknown): v is Doc => typeof v === "object" && v !== null && !Array.isArray(v);

async function seedOnce(app: AppId, workspaceId: string, userId: string | null) {
  const def = DEFS[app];
  if (!def.seed) return;
  const cfg = def.tables.config;
  const [mark] = await db.select({ id: cfg.id }).from(cfg).where(and(eq(cfg.workspaceId, workspaceId), eq(cfg.id, SEEDED)));
  if (mark) return;
  const rows = JSON.parse(await readFile(path.join(process.cwd(), "tools-src", def.seed.file), "utf8")) as Record<string, Doc>;
  const table = def.tables[def.seed.collection];
  await db.transaction(async (tx) => {
    const done = await tx.insert(cfg).values({ workspaceId, id: SEEDED, data: { at: new Date().toISOString() }, updatedById: userId }).onConflictDoNothing().returning({ id: cfg.id });
    if (!done.length) return; // someone else seeded a moment ago
    const [any] = await tx.select({ id: table.id }).from(table).where(eq(table.workspaceId, workspaceId)).limit(1);
    if (any) return;
    for (const [id, data] of Object.entries(rows)) await tx.insert(table).values({ workspaceId, id, data, updatedById: userId });
  });
}

/** Everything a tool's screens need, keyed the way the screens expect. */
export async function loadDocs(app: AppId, workspaceId: string, userId: string | null = null): Promise<Record<string, Record<string, Doc>>> {
  await seedOnce(app, workspaceId, userId);
  const def = DEFS[app];
  const out: Record<string, Record<string, Doc>> = {};
  await Promise.all(
    Object.entries(def.tables).map(async ([c, table]) => {
      out[c] = {};
      const rows = await db.select({ id: table.id, data: table.data }).from(table).where(eq(table.workspaceId, workspaceId));
      for (const r of rows) if (!r.id.startsWith("_")) out[c][r.id] = r.data;
    }),
  );
  return out;
}

/**
 * One write from the screens. "set" replaces the record, "update" merges top-level fields
 * (the meaning the screens were written against), "delete" removes it.
 */
export async function writeDoc(app: AppId, workspaceId: string, userId: string, canAdmin: boolean, input: { collection: string; id: string; op: "set" | "update" | "delete"; data?: unknown }) {
  const def = DEFS[app];
  const { collection, id, op } = input;
  const table = def.tables[collection];
  if (!table || !Object.hasOwn(def.tables, collection)) throw new Error("Unknown collection.");
  if (!ID.test(id)) throw new Error("Bad record id.");
  const where = and(eq(table.workspaceId, workspaceId), eq(table.id, id));

  if (collection === "config") {
    if (!def.configKeys.includes(id)) throw new Error("Unknown setting.");
    if (op === "delete") throw new Error("Settings can't be deleted.");
    if (def.adminConfig.includes(id) && !canAdmin) throw new ForbiddenError("Only owners and admins can change this setting.");
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
    if (collection === "config" && !canAdmin) def.editorConfigGuard?.({ id, data, existing: existing?.data });
    if (existing) await tx.update(table).set({ data, updatedById: userId, updatedAt: new Date() }).where(where);
    else await tx.insert(table).values({ workspaceId, id, data, updatedById: userId });
  });
}

export type ImportPlan = { docs: Record<string, Record<string, Doc>>; problems: string[] };

/** Accepts {id: record} maps or arrays of records carrying id / _id / doc_id. */
function readCollection(v: unknown, name: string, problems: string[]): Record<string, Doc> {
  const out: Record<string, Doc> = {};
  if (v == null) return out;
  const put = (id: unknown, doc: unknown) => {
    if (typeof id !== "string" || !ID.test(id) || id.startsWith("_")) return problems.push(`${name}: skipped a record with no usable id`);
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
export function planImport(app: AppId, json: unknown): ImportPlan {
  const def = DEFS[app];
  const problems: string[] = [];
  const docs: Record<string, Record<string, Doc>> = {};
  for (const c of Object.keys(def.tables)) docs[c] = {};
  if (!isPlain(json)) return { docs, problems: [`The file isn't a JSON object with ${Object.keys(def.labels).join(", ")}.`] };
  for (const c of Object.keys(def.labels)) docs[c] = readCollection(json[c], c, problems);
  for (const [k, v] of Object.entries(readCollection(json.config, "config", problems))) {
    if (def.configKeys.includes(k)) docs.config[k] = v;
    else problems.push(`config/${k}: skipped, not a setting of this tool`);
  }
  for (const k of Object.keys(json)) if (k !== "config" && !def.labels[k]) problems.push(`"${k}": skipped, this tool has no such list`);
  def.checkImport?.(docs, problems);
  return { docs, problems };
}

/** "merge" adds new records and overwrites ones with the same id; "replace" clears the tool first. */
export async function runImport(app: AppId, workspaceId: string, userId: string, plan: ImportPlan, mode: "merge" | "replace") {
  const def = DEFS[app];
  await db.transaction(async (tx) => {
    for (const [c, table] of Object.entries(def.tables)) {
      if (mode === "replace") await tx.delete(table).where(eq(table.workspaceId, workspaceId));
      for (const [id, data] of Object.entries(plan.docs[c] ?? {})) {
        await tx
          .insert(table)
          .values({ workspaceId, id, data, updatedById: userId })
          .onConflictDoUpdate({ target: [table.workspaceId, table.id], set: { data, updatedById: userId, updatedAt: new Date() } });
      }
    }
    // An import is a deliberate starting point, so the built-in starter list never loads on top of it.
    if (def.seed) await tx.insert(def.tables.config).values({ workspaceId, id: SEEDED, data: { at: new Date().toISOString(), by: "import" }, updatedById: userId }).onConflictDoNothing();
  });
}
