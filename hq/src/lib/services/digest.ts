import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendEmail } from "@/lib/email";
import { listTasks, tasksForUser, roleIdsFor } from "./tasks";
import { getSetting, setSetting } from "./app-settings";
import { TZ, todayISO } from "@/lib/recurrence";

const { users, memberships, workspaces } = schema;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const DIGEST_HOUR = 7;

/**
 * The morning email: for each person who turned it on, what's due today and overdue
 * in every company they belong to. Nothing to do = no email. Runs once per day; the
 * date it last ran is kept in app settings so restarts don't resend.
 */
export async function sendDailyDigests(force = false) {
  const today = todayISO();
  const hour = +new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: TZ });
  if (!force && hour < DIGEST_HOUR) return { sent: 0, skipped: "too early" };
  if (!force && (await getSetting("digest_sent_on")) === today) return { sent: 0, skipped: "already sent" };
  await setSetting("digest_sent_on", today); // claim the day first so two instances don't both send

  const people = await db.select().from(users).where(eq(users.notifyDigest, true));
  let sent = 0;
  const appUrl = process.env.APP_URL ?? "https://myorbithq.net";
  const cache = new Map<string, Awaited<ReturnType<typeof listTasks>>>();

  for (const u of people) {
    const mine = await db.select({ ws: workspaces }).from(memberships).innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId)).where(eq(memberships.userId, u.id));
    const sections: { name: string; slug: string; overdue: string[]; today: string[] }[] = [];
    for (const { ws } of mine) {
      const all = cache.get(ws.id) ?? (await listTasks(ws.id));
      cache.set(ws.id, all);
      const list = tasksForUser(all, u.id, await roleIdsFor(ws.id, u.id));
      const overdue = list.filter((t) => t.state === "overdue").map((t) => t.title);
      const due = list.filter((t) => t.state === "today").map((t) => t.title);
      if (overdue.length || due.length) sections.push({ name: ws.name, slug: ws.slug, overdue, today: due });
    }
    if (!sections.length) continue;
    const hi = u.firstName || u.name?.split(" ")[0] || "there";
    const totalOverdue = sections.reduce((n, s) => n + s.overdue.length, 0);
    const totalToday = sections.reduce((n, s) => n + s.today.length, 0);
    const subject = `Today: ${[totalToday && `${totalToday} due`, totalOverdue && `${totalOverdue} overdue`].filter(Boolean).join(", ")}`;
    const text = `Hi ${hi},\n\nHere's your day in Orbit.\n\n${sections.map((s) => `${s.name}\n${s.today.map((t) => `  • Due today: ${t}`).join("\n")}${s.today.length && s.overdue.length ? "\n" : ""}${s.overdue.map((t) => `  • Overdue: ${t}`).join("\n")}\n${appUrl}/w/${s.slug}/tasks`).join("\n\n")}\n\nTurn this email off under Settings → People → My notifications.`;
    const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1f1f1d">
  <div style="font-size:22px;font-weight:700;margin-bottom:4px">Orbit</div>
  <div style="font-size:13px;color:#777;margin-bottom:20px">${esc(new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ }))}</div>
  <p style="font-size:16px;line-height:1.5">Hi ${esc(hi)}, here's your day.</p>
  ${sections
    .map(
      (s) => `<div style="border:1px solid #e3e3e0;border-radius:10px;padding:14px 16px;margin:14px 0">
    <div style="font-weight:600;margin-bottom:8px">${esc(s.name)}</div>
    ${s.today.map((t) => `<div style="font-size:14px;padding:3px 0"><span style="color:#b7791f;font-weight:600">Due today</span> · ${esc(t)}</div>`).join("")}
    ${s.overdue.map((t) => `<div style="font-size:14px;padding:3px 0"><span style="color:#d13f4a;font-weight:600">Overdue</span> · ${esc(t)}</div>`).join("")}
    <a href="${appUrl}/w/${s.slug}/tasks" style="display:inline-block;margin-top:10px;font-size:13px;color:#4f5fd8">Open the tracker →</a>
  </div>`,
    )
    .join("")}
  <p style="font-size:12px;color:#999;margin-top:24px">Turn this email off under Settings → People → My notifications.</p>
</div>`;
    const r = await sendEmail({ to: u.email, subject, html, text });
    if (r.ok) sent++;
  }
  return { sent };
}
