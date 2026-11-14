import "server-only";
import { createHash, randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentSessionId } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email";
import type { User } from "@/db/schema";

const { sessions } = schema;

/** How long the owner area stays open after entering a code. */
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

/** True when this sign-in has entered a valid code in the last 12 hours. */
export async function isUnlocked() {
  const s = await mySession();
  return Boolean(s?.unlockedUntil && s.unlockedUntil.getTime() > Date.now());
}

/** Emails a 6-digit code to the person's sign-in address. The code is stored hashed, never in plain text. */
export async function sendUnlockCode(user: User) {
  const s = await mySession();
  if (!s) throw new Error("Please sign in again.");
  if (s.unlockCodeExpires) {
    const sentAt = s.unlockCodeExpires.getTime() - CODE_MINUTES * 60_000;
    if (Date.now() - sentAt < RESEND_SECONDS * 1000) throw new Error("A code was just sent. Check your email, or wait 30 seconds to send another.");
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db
    .update(sessions)
    .set({ unlockCodeHash: sha(`${s.id}:${code}`), unlockCodeExpires: new Date(Date.now() + CODE_MINUTES * 60_000), unlockAttempts: 0 })
    .where(eq(sessions.id, s.id));
  const text = `Your Orbit code is ${code}\n\nIt opens your dashboards for ${UNLOCK_HOURS} hours on this device and stops working in ${CODE_MINUTES} minutes.\n\nIf you didn't ask for this, someone may be signed in as you. Sign out of Orbit everywhere and tell Andrew.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:440px;margin:0 auto;padding:32px 24px;color:#1f1f1d">
  <div style="font-size:22px;font-weight:700;margin-bottom:16px">Orbit</div>
  <p style="font-size:16px;line-height:1.5">Your code to open your dashboards:</p>
  <div style="font-size:34px;font-weight:700;letter-spacing:8px;margin:18px 0">${code}</div>
  <p style="font-size:14px;line-height:1.5;color:#555">It stops working in ${CODE_MINUTES} minutes. Once entered, dashboards stay open for ${UNLOCK_HOURS} hours on this device.</p>
  <p style="font-size:13px;line-height:1.5;color:#888">Didn't ask for this? Someone may be signed in as you. Sign out of Orbit and change your Google password.</p>
</div>`;
  const r = await sendEmail({ to: user.email, subject: `Orbit code: ${code}`, html, text });
  if (!r.ok) throw new Error("The email didn't send. Try again in a minute.");
  if (r.logged && process.env.NODE_ENV === "production") throw new Error("Email isn't set up on the server, so codes can't be sent. Add RESEND_API_KEY in Railway.");
  return { to: user.email };
}

/** Checks a code. Five wrong tries and the code is thrown away. */
export async function verifyUnlockCode(code: string) {
  const s = await mySession();
  if (!s) throw new Error("Please sign in again.");
  const clean = code.replace(/\D/g, "");
  if (!s.unlockCodeHash || !s.unlockCodeExpires || s.unlockCodeExpires.getTime() < Date.now()) throw new Error("That code has expired. Send a new one.");
  if (s.unlockAttempts >= MAX_ATTEMPTS) throw new Error("Too many tries. Send a new code.");
  if (sha(`${s.id}:${clean}`) !== s.unlockCodeHash) {
    const left = MAX_ATTEMPTS - s.unlockAttempts - 1;
    await db.update(sessions).set({ unlockAttempts: s.unlockAttempts + 1, ...(left <= 0 ? { unlockCodeHash: null } : {}) }).where(eq(sessions.id, s.id));
    throw new Error(left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many tries. Send a new code.");
  }
  await db
    .update(sessions)
    .set({ unlockedUntil: new Date(Date.now() + UNLOCK_HOURS * 3600_000), unlockCodeHash: null, unlockCodeExpires: null, unlockAttempts: 0 })
    .where(eq(sessions.id, s.id));
}

/** Close the owner area again on this device. */
export async function relock() {
  const id = await currentSessionId();
  if (id) await db.update(sessions).set({ unlockedUntil: null }).where(eq(sessions.id, id));
}
