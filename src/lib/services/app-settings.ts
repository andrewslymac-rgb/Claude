import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { appSettings } = schema;
const cache = new Map<string, { v: string | null; at: number }>();

export async function getSetting(key: string): Promise<string | null> {
  const c = cache.get(key);
  if (c && Date.now() - c.at < 30_000) return c.v;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  const v = row?.value ?? null;
  cache.set(key, { v, at: Date.now() });
  return v;
}

export async function setSetting(key: string, value: string | null) {
  if (value === null) await db.delete(appSettings).where(eq(appSettings.key, key));
  else await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  cache.delete(key);
}
