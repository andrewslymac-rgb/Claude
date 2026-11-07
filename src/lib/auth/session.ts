import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { users, sessions, invites, memberships } = schema;
export const SESSION_COOKIE = "hq_session";
const SESSION_DAYS = 30;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ id: hash(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hash(token)));
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hash(token)), gt(sessions.expiresAt, new Date())));
  return row?.user ?? null;
});

export class SignInError extends Error {}

/**
 * Called after Google (or dev login) has confirmed who someone is.
 * Only people who already have an account, have been invited, or are the
 * configured owner may sign in. The very first person in becomes app admin.
 */
export async function signInWithVerifiedEmail(input: { email: string; name?: string | null; avatarUrl?: string | null }) {
  const email = input.email.trim().toLowerCase();
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();

  let [user] = await db.select().from(users).where(eq(users.email, email));
  const pending = await db.select().from(invites).where(eq(invites.email, email));

  if (!user) {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const isOwner = email === ownerEmail;
    const domainOk = domains.length > 0 && domains.includes(email.split("@")[1]);
    if (count > 0 && !isOwner && pending.length === 0 && !domainOk) {
      throw new SignInError("You haven't been invited yet. Ask an admin to add your email.");
    }
    [user] = await db
      .insert(users)
      .values({ email, name: input.name ?? email.split("@")[0], avatarUrl: input.avatarUrl, isAppAdmin: count === 0 || isOwner })
      .returning();
  }

  for (const inv of pending) {
    await db.insert(memberships).values({ workspaceId: inv.workspaceId, userId: user.id, role: inv.role }).onConflictDoNothing();
    await db.delete(invites).where(eq(invites.id, inv.id));
  }

  await db
    .update(users)
    .set({ lastSeenAt: new Date(), name: user.name ?? input.name, avatarUrl: input.avatarUrl ?? user.avatarUrl })
    .where(eq(users.id, user.id));
  await createSession(user.id);
  return user;
}

const NEXT_COOKIE = "orbit_next";

/** Remember where to send someone after they sign in (only same-site paths). */
export async function rememberNext(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return;
  (await cookies()).set(NEXT_COOKIE, path, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
}

/** Where to go after sign-in: the remembered path, or "/". Clears the cookie. */
export async function consumeNext(): Promise<string> {
  const jar = await cookies();
  const next = jar.get(NEXT_COOKIE)?.value;
  if (next) jar.delete(NEXT_COOKIE);
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export const devLoginEnabled = () =>
  process.env.ALLOW_DEV_LOGIN === "true" || (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN !== "false");

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// ---------------------------------------------------------------------------
// Email sign-in links
// ---------------------------------------------------------------------------

const { loginTokens } = schema;
const LINK_MINUTES = 15;
const MAX_LINKS_PER_HOUR = 5;

/** Can this email get into Orbit at all? (Existing account, invite, allowed domain, or the owner.) */
export async function emailIsAllowed(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return true;
  if (email === process.env.OWNER_EMAIL?.trim().toLowerCase()) return true;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count === 0) return true; // very first person in
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (domains.includes(email.split("@")[1])) return true;
  const [inv] = await db.select({ id: invites.id }).from(invites).where(eq(invites.email, email));
  return Boolean(inv);
}

/** Cookie on the browser that asked for a link. Lets that browser sign itself in once the link is clicked anywhere. */
const WAIT_COOKIE = "orbit_login_wait";

/**
 * Creates a one-time sign-in link and marks this browser as the one waiting for it.
 * Returns null if this email asked too often.
 */
export async function createLoginLink(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const hourAgo = new Date(Date.now() - 3600_000);
  const [{ recent }] = await db.select({ recent: sql<number>`count(*)::int` }).from(loginTokens).where(and(eq(loginTokens.email, email), gt(loginTokens.createdAt, hourAgo)));
  if (recent >= MAX_LINKS_PER_HOUR) return null;
  const token = randomBytes(32).toString("base64url");
  const requester = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_MINUTES * 60_000);
  await db.insert(loginTokens).values({ id: hash(token), email, expiresAt, requesterHash: hash(requester) });
  (await cookies()).set(WAIT_COOKIE, requester, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return `${appUrl}/api/auth/magic/verify?token=${token}`;
}

/**
 * Redeems a link in the browser that opened it. Throws SignInError if it's bad, used or expired.
 * Returns whether this is the same browser that asked for the link.
 */
export async function redeemLoginLink(token: string) {
  const [row] = await db.select().from(loginTokens).where(eq(loginTokens.id, hash(token)));
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new SignInError("That sign-in link has expired or was already used. Request a new one.");
  const jar = await cookies();
  const waiting = jar.get(WAIT_COOKIE)?.value;
  const sameBrowser = Boolean(waiting && row.requesterHash && hash(waiting) === row.requesterHash);
  await db.update(loginTokens).set({ usedAt: new Date(), ...(sameBrowser ? { claimedAt: new Date() } : {}) }).where(eq(loginTokens.id, row.id));
  if (sameBrowser) jar.delete(WAIT_COOKIE);
  const user = await signInWithVerifiedEmail({ email: row.email });
  return { user, sameBrowser };
}

/**
 * Polled by the login page while it waits. Once the link has been clicked anywhere
 * (another Chrome profile, a phone), the browser that asked gets its own session here.
 */
export async function claimWaitingLogin(): Promise<"waiting" | "done" | "expired"> {
  const jar = await cookies();
  const waiting = jar.get(WAIT_COOKIE)?.value;
  if (!waiting) return "expired";
  const [row] = await db.select().from(loginTokens).where(eq(loginTokens.requesterHash, hash(waiting)));
  if (!row || row.claimedAt || row.expiresAt < new Date()) {
    jar.delete(WAIT_COOKIE);
    return "expired";
  }
  if (!row.usedAt) return "waiting";
  await db.update(loginTokens).set({ claimedAt: new Date() }).where(eq(loginTokens.id, row.id));
  jar.delete(WAIT_COOKIE);
  await signInWithVerifiedEmail({ email: row.email });
  return "done";
}
