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
    const invitedName = pending.find((p) => p.firstName || p.lastName);
    [user] = await db
      .insert(users)
      .values({
        email,
        firstName: invitedName?.firstName ?? null,
        lastName: invitedName?.lastName ?? null,
        name: (invitedName ? [invitedName.firstName, invitedName.lastName].filter(Boolean).join(" ") : null) || input.name || email.split("@")[0],
        avatarUrl: input.avatarUrl,
        isAppAdmin: count === 0 || isOwner,
      })
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

/**
 * Google sign-in is off: everyone signs in with an emailed link. It stays in the code
 * so it can be switched back on with GOOGLE_LOGIN_ENABLED=true plus the client id and secret.
 */
export const googleEnabled = () => process.env.GOOGLE_LOGIN_ENABLED === "true" && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

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

const INVITE_HOURS = 72;

/**
 * A sign-in link sent on someone's behalf (a welcome invite or a resend). It lasts
 * 3 days and signs in wherever it is opened, since nobody is waiting in a browser.
 */
export async function createInviteLink(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const token = randomBytes(32).toString("base64url");
  await db.insert(loginTokens).values({ id: hash(token), email, expiresAt: new Date(Date.now() + INVITE_HOURS * 3600_000), requesterHash: null });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return `${appUrl}/api/auth/magic/verify?token=${token}`;
}

const OPEN_COOKIE = "orbit_login_open";
const OPEN_MINUTES = 10;

/**
 * Redeems a link in the browser that opened it. Throws SignInError if it's bad, used or expired.
 * If this is the browser that asked for the link, it signs in right here. If not (the link
 * opened in another Chrome profile or on a phone), the asking window signs itself in via
 * claimWaitingLogin and this browser only gets a session if the person chooses "Open here".
 */
export async function redeemLoginLink(token: string) {
  const [row] = await db.select().from(loginTokens).where(eq(loginTokens.id, hash(token)));
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new SignInError("That sign-in link has expired or was already used. Request a new one.");
  const jar = await cookies();
  const waiting = jar.get(WAIT_COOKIE)?.value;
  // Invite links have no waiting browser: they sign in right where they're opened.
  const sameBrowser = !row.requesterHash || Boolean(waiting && hash(waiting) === row.requesterHash);
  await db.update(loginTokens).set({ usedAt: new Date(), ...(sameBrowser ? { claimedAt: new Date() } : {}) }).where(eq(loginTokens.id, row.id));
  if (sameBrowser) {
    jar.delete(WAIT_COOKIE);
    await signInWithVerifiedEmail({ email: row.email });
  } else {
    jar.set(OPEN_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: OPEN_MINUTES * 60 });
  }
  return { sameBrowser };
}

/** "Open Orbit here" on the page a link lands on when it wasn't opened where it was asked for. */
export async function signInWhereLinkOpened() {
  const jar = await cookies();
  const token = jar.get(OPEN_COOKIE)?.value;
  if (!token) throw new SignInError("That sign-in link has expired. Request a new one.");
  jar.delete(OPEN_COOKIE);
  const [row] = await db.select().from(loginTokens).where(eq(loginTokens.id, hash(token)));
  if (!row || !row.usedAt || row.usedAt < new Date(Date.now() - OPEN_MINUTES * 60_000)) throw new SignInError("That sign-in link has expired. Request a new one.");
  await signInWithVerifiedEmail({ email: row.email });
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
