import "server-only";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { like } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { getSetting, setSetting } from "@/lib/services/app-settings";

/**
 * Locked Links: a private list of links per person, per company, behind a PIN.
 * - The links are stored encrypted and belong to one person: nobody else, including other
 *   owners and AI tools, is ever sent them. They are not in search.
 * - The PIN is stored only as a salted hash.
 * - Entering the PIN unlocks this browser for a short while (a signed, http-only cookie).
 * - Five wrong PINs in a row locks the person out for 15 minutes.
 */
export type LockedLink = { id: string; label: string; url: string; description?: string };

export const UNLOCK_MINUTES = 15;
const MAX_TRIES = 5;
const LOCKOUT_MINUTES = 15;
const COOKIE = "orbit_locked";
const pinKey = (userId: string) => `locked_pin:${userId}`;
const failKey = (userId: string) => `locked_fail:${userId}`;
const linksKey = (workspaceId: string, userId: string) => `locked_links:${workspaceId}:${userId}`;

const hashPin = (pin: string, salt = randomBytes(16).toString("hex")) => `s1$${salt}$${scryptSync(pin, salt, 32).toString("hex")}`;
function pinMatches(pin: string, stored: string) {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const a = scryptSync(pin, salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export const validPin = (pin: string) => /^\d{4,8}$/.test(pin);

export async function hasPin(userId: string) {
  return Boolean(await getSetting(pinKey(userId)));
}

async function setUnlocked(userId: string) {
  (await cookies()).set(COOKIE, encrypt(JSON.stringify({ u: userId, exp: Date.now() + UNLOCK_MINUTES * 60_000 })), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: UNLOCK_MINUTES * 60 });
}

export async function lock() {
  (await cookies()).set(COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

/** True while this browser has entered this person's PIN recently. */
export async function isUnlocked(userId: string) {
  try {
    const raw = (await cookies()).get(COOKIE)?.value;
    if (!raw || !raw.startsWith("v1.")) return false;
    const p = JSON.parse(decrypt(raw) ?? "{}") as { u?: string; exp?: number };
    return p.u === userId && typeof p.exp === "number" && p.exp > Date.now();
  } catch {
    return false;
  }
}

async function failState(userId: string) {
  try {
    return JSON.parse((await getSetting(failKey(userId))) ?? "{}") as { n?: number; until?: number };
  } catch {
    return {};
  }
}

/** Checks the PIN and unlocks this browser. Throws a plain-English error on a wrong PIN or a lockout. */
export async function unlock(userId: string, pin: string) {
  const stored = await getSetting(pinKey(userId));
  if (!stored) throw new Error("Set a PIN first.");
  const f = await failState(userId);
  if (f.until && f.until > Date.now()) throw new Error(`Too many wrong tries. Try again in ${Math.ceil((f.until - Date.now()) / 60_000)} minutes.`);
  if (!validPin(pin) || !pinMatches(pin, stored)) {
    const n = (f.until ? 0 : f.n ?? 0) + 1;
    await setSetting(failKey(userId), JSON.stringify(n >= MAX_TRIES ? { n: 0, until: Date.now() + LOCKOUT_MINUTES * 60_000 } : { n }));
    throw new Error(n >= MAX_TRIES ? `Too many wrong tries. Locked for ${LOCKOUT_MINUTES} minutes.` : `Wrong PIN. ${MAX_TRIES - n} ${MAX_TRIES - n === 1 ? "try" : "tries"} left.`);
  }
  await setSetting(failKey(userId), null);
  await setUnlocked(userId);
}

/** First PIN, or a change: changing needs the browser to be unlocked already. */
export async function setPin(userId: string, pin: string) {
  if (!validPin(pin)) throw new Error("Use 4 to 8 digits.");
  if ((await hasPin(userId)) && !(await isUnlocked(userId))) throw new Error("Unlock with your current PIN first.");
  await setSetting(pinKey(userId), hashPin(pin));
  await setUnlocked(userId);
}

/** Forgot the PIN: the only way back in is to start over. Clears the PIN and every locked link this person has, in every company. */
export async function resetEverything(userId: string) {
  const mine = await db.select({ key: schema.appSettings.key }).from(schema.appSettings).where(like(schema.appSettings.key, `locked_links:%:${userId}`));
  for (const row of mine) await setSetting(row.key, null);
  await setSetting(pinKey(userId), null);
  await setSetting(failKey(userId), null);
  await lock();
}

async function mustBeUnlocked(userId: string) {
  if (!(await isUnlocked(userId))) throw new Error("Locked. Enter your PIN again.");
  await setUnlocked(userId); // using it keeps it open
}

async function read(workspaceId: string, userId: string): Promise<LockedLink[]> {
  try {
    const raw = await getSetting(linksKey(workspaceId, userId));
    const list = raw ? JSON.parse(decrypt(raw) ?? "[]") : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
const write = (workspaceId: string, userId: string, list: LockedLink[]) => setSetting(linksKey(workspaceId, userId), list.length ? encrypt(JSON.stringify(list)) : null);

function clean(input: { label: string; url: string; description?: string }) {
  let url = input.url.trim();
  if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  let host = "";
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
    host = u.host;
  } catch {
    throw new Error("That doesn't look like a web link.");
  }
  return { label: input.label.trim().slice(0, 80) || host, url: url.slice(0, 2000), description: input.description?.trim().slice(0, 300) || undefined };
}

/** The links, only if this browser is unlocked for this person. Null means locked. Reading does not extend the session. */
export async function peekLocked(workspaceId: string, userId: string) {
  return (await isUnlocked(userId)) ? read(workspaceId, userId) : null;
}

export async function addLocked(workspaceId: string, userId: string, input: { label: string; url: string; description?: string }) {
  await mustBeUnlocked(userId);
  const list = await read(workspaceId, userId);
  if (list.length >= 100) throw new Error("That's the limit of 100 locked links.");
  await write(workspaceId, userId, [...list, { id: randomUUID(), ...clean(input) }]);
}

export async function updateLocked(workspaceId: string, userId: string, id: string, input: { label: string; url: string; description?: string }) {
  await mustBeUnlocked(userId);
  const list = await read(workspaceId, userId);
  if (!list.some((l) => l.id === id)) throw new Error("That link is gone.");
  await write(workspaceId, userId, list.map((l) => (l.id === id ? { id, ...clean(input) } : l)));
}

export async function takeOutLocked(workspaceId: string, userId: string, id: string) {
  await mustBeUnlocked(userId);
  await write(workspaceId, userId, (await read(workspaceId, userId)).filter((l) => l.id !== id));
}
