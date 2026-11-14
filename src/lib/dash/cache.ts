import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { dataCache } = schema;

export type Cached<T> = { data: T; fetchedAt: string; fromCache: boolean };

/** One pull at a time per company and screen, so ten quick taps make one API call. */
const inFlight = new Map<string, Promise<unknown>>();

/** A tap on Refresh within this window reuses the last pull instead of hitting the API again. */
const MIN_REFRESH_MS = 30_000;

/**
 * Returns the stored copy if it's younger than `ttlMs`, otherwise pulls fresh and stores it.
 * `force` (the Refresh button) still waits 30 seconds between real pulls.
 * Rows are keyed by company, so one company's data can never be served to another.
 */
export async function cached<T>(workspaceId: string, key: string, ttlMs: number, pull: () => Promise<T>, force = false): Promise<Cached<T>> {
  const [row] = await db.select().from(dataCache).where(and(eq(dataCache.workspaceId, workspaceId), eq(dataCache.key, key)));
  const age = row ? Date.now() - row.fetchedAt.getTime() : Infinity;
  if (row && (age < (force ? MIN_REFRESH_MS : ttlMs))) return { data: row.payload as T, fetchedAt: row.fetchedAt.toISOString(), fromCache: true };

  const id = `${workspaceId}:${key}`;
  let p = inFlight.get(id) as Promise<T> | undefined;
  if (!p) {
    p = pull();
    inFlight.set(id, p);
    p.finally(() => inFlight.delete(id)).catch(() => {});
  }
  const data = await p;
  const fetchedAt = new Date();
  await db
    .insert(dataCache)
    .values({ workspaceId, key, payload: data, fetchedAt })
    .onConflictDoUpdate({ target: [dataCache.workspaceId, dataCache.key], set: { payload: data, fetchedAt } });
  return { data, fetchedAt: fetchedAt.toISOString(), fromCache: false };
}
