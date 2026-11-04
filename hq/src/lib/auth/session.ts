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

export const devLoginEnabled = () =>
  process.env.ALLOW_DEV_LOGIN === "true" || (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN !== "false");

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
