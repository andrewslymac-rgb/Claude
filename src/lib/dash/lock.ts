import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentSessionId } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email";
import type { User, Workspace } from "@/db/schema";

const { sessions, dashUnlocks, memberships } = schema;

/** How long a company's dashboards stay open after entering its code. */
export const UNLOCK_HOURS = 12;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 30;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function mySession() {
  const id = await currentSessionId();
  if (!id) return null;
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
  return row ?? null;
}

/**
 * Where this person's codes for this company go: the address they set for the company
 * (Settings → People → My notifications), otherwise their sign-in email.
 */
export async function codeAddressFor(user: User, workspaceId: string) {
  const [m] = await db.select({ notifyEmail: memberships.notifyEmail }).from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, user.id)));
  return m?.notifyEmail || user.email;
}

/** True when this sign-in entered this company's code in the last 12 hours. Each company unlocks separately. */
export async function isUnlocked(workspaceId: string) {
  const id = await currentSessionId();
  if (!id) return false;
  const [row] = await db.select().from(dashUnlocks).where(and(eq(dashUnlocks.sessionId, id), eq(dashUnlocks.workspaceId, workspaceId), gt(dashUnlocks.unlockedUntil, new Date())));
  return Boolean(row);
}

/** Emails a 6-digit code for one company. Stored hashed together with the company, so it can't open another one. */
export async function sendUnlockCode(user: User, ws: Workspace) {
  const s = await mySession();
  if (!s) throw new Error("Please sign in again.");
  if (s.unlockCodeExpires) {
    const sentAt = s.unlockCodeExpires.getTime() - CODE_MINUTES * 60_000;
    if (Date.now() - sentAt < RESEND_SECONDS * 1000) throw new Error("A code was just sent. Check your email, or wait 30 seconds to send another.");
  }
  const to = await codeAddressFor(user, ws.id);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db
    .update(sessions)
    .set({ unlockCodeHash: sha(`${s.id}:${ws.id}:${code}`), unlockCodeExpires: new Date(Date.now() + CODE_MINUTES * 60_000), unlockAttempts: 0 })
    .where(eq(sessions.id, s.id));
  const text = `Your Orbit code for ${ws.name} is ${code}\n\nIt opens ${ws.name}'s dashboards for ${UNLOCK_HOURS} hours on this device and stops working in ${CODE_MINUTES} minutes.\n\nIf you didn't ask for this, someone may be signed in as you. Sign out of Orbit and change your Google password.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:440px;margin:0 auto;padding:32px 24px;color:#1f1f1d">
  <div style="font-size:22px;font-weight:700;margin-bottom:16px">Orbit</div>
  <p style="font-size:16px;line-height:1.5">Your code to open <strong>${ws.name.replace(/[<>&]/g, "")}</strong> dashboards:</p>
  <div style="font-size:34px;font-weight:700;letter-spacing:8px;margin:18px 0">${code}</div>
  <p style="font-size:14px;line-height:1.5;color:#555">It stops working in ${CODE_MINUTES} minutes. Once entered, ${ws.name.replace(/[<>&]/g, "")}'s dashboards stay open for ${UNLOCK_HOURS} hours on this device.</p>
  <p style="font-size:13px;line-height:1.5;color:#888">Didn't ask for this? Someone may be signed in as you. Sign out of Orbit and change your Google password.</p>
</div>`;
  const r = await sendEmail({ to, subject: `${ws.name} dashboards code: ${code}`, html, text });
  if (!r.ok) throw new Error("The email didn't send. Try again in a minute.");
  if (r.logged && process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_LOGIN !== "true") throw new Error("Email isn't set up on the server, so codes can't be sent. Add RESEND_API_KEY in Railway.");
  return { to };
}

/** Checks a code for one company. Five wrong tries and the code is thrown away. */
export async function verifyUnlockCode(code: string, workspaceId: string) {
  const s = await mySession();
  if (!s) throw new Error("Please sign in again.");
  const clean = code.replace(/\D/g, "");
  if (!s.unlockCodeHash || !s.unlockCodeExpires || s.unlockCodeExpires.getTime() < Date.now()) throw new Error("That code has expired. Send a new one.");
  if (s.unlockAttempts >= MAX_ATTEMPTS) throw new Error("Too many tries. Send a new code.");
  if (sha(`${s.id}:${workspaceId}:${clean}`) !== s.unlockCodeHash) {
    const left = MAX_ATTEMPTS - s.unlockAttempts - 1;
    await db.update(sessions).set({ unlockAttempts: s.unlockAttempts + 1, ...(left <= 0 ? { unlockCodeHash: null } : {}) }).where(eq(sessions.id, s.id));
    throw new Error(left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many tries. Send a new code.");
  }
  const until = new Date(Date.now() + UNLOCK_HOURS * 3600_000);
  await db.update(sessions).set({ unlockCodeHash: null, unlockCodeExpires: null, unlockAttempts: 0 }).where(eq(sessions.id, s.id));
  await db
    .insert(dashUnlocks)
    .values({ sessionId: s.id, workspaceId, unlockedUntil: until })
    .onConflictDoUpdate({ target: [dashUnlocks.sessionId, dashUnlocks.workspaceId], set: { unlockedUntil: until } });
}

/** Close one company's dashboards again on this device. */
export async function relock(workspaceId: string) {
  const id = await currentSessionId();
  if (id) await db.delete(dashUnlocks).where(and(eq(dashUnlocks.sessionId, id), eq(dashUnlocks.workspaceId, workspaceId)));
}
