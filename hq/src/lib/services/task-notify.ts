import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendEmail } from "@/lib/email";
import { FREQUENCY_LABELS } from "@/lib/recurrence";

const { tasks, users, workspaces, memberRoles, memberships } = schema;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : null);

/** Everyone a task was just given to: people added directly, plus everyone in a newly set job role. */
export async function recipientsFor(workspaceId: string, opts: { userIds: string[]; roleId?: string | null }) {
  const ids = new Set(opts.userIds);
  if (opts.roleId) {
    const held = await db.select({ userId: memberRoles.userId }).from(memberRoles).where(and(eq(memberRoles.workspaceId, workspaceId), eq(memberRoles.roleId, opts.roleId)));
    for (const h of held) ids.add(h.userId);
  }
  return [...ids];
}

/**
 * Emails people that a task was added to their to-do list. Never emails the person who
 * made the change, and only emails current members of the company. Failures are logged,
 * never thrown: a missed email must not undo the task.
 */
export async function notifyAssigned(workspaceId: string, taskId: string, userIds: string[], actorId: string | null) {
  try {
    const to = userIds.filter((u) => u !== actorId);
    if (!to.length) return;
    const [[task], [ws], actor, recipients] = await Promise.all([
      db.select().from(tasks).where(eq(tasks.id, taskId)),
      db.select().from(workspaces).where(eq(workspaces.id, workspaceId)),
      actorId ? db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, actorId)) : Promise.resolve([]),
      db
        .select({ id: users.id, email: users.email, firstName: users.firstName, name: users.name })
        .from(users)
        .innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.workspaceId, workspaceId)))
        .where(inArray(users.id, to)),
    ]);
    if (!task || !ws) return;
    const by = actor[0]?.name || actor[0]?.email?.split("@")[0] || "Someone";
    const appUrl = process.env.APP_URL ?? "https://myorbithq.net";
    const link = `${appUrl}/w/${ws.slug}/tasks`;
    const repeat = task.frequency === "once" ? "One-off" : FREQUENCY_LABELS[task.frequency];
    const due = fmtDate(task.nextDueOn);
    const when = [repeat, task.whenText, due && `next due ${due}`].filter(Boolean).join(" · ");
    const instructions = task.instructions?.trim();

    for (const r of recipients) {
      const hi = r.firstName || r.name?.split(" ")[0] || "Hi";
      const text = `${hi === "Hi" ? "Hi" : `Hi ${hi}`},\n\n${by} added a task to your to-do list in ${ws.name}:\n\n${task.title}\n${when}${instructions ? `\n\n${instructions}` : ""}\n\nOpen your to-do list:\n${link}`;
      const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f1f1d">
  <div style="font-size:22px;font-weight:700;margin-bottom:16px">Orbit</div>
  <p style="font-size:16px;line-height:1.5">${hi === "Hi" ? "Hi" : `Hi ${esc(hi)}`}, <strong>${esc(by)}</strong> added a task to your to-do list in <strong>${esc(ws.name)}</strong>:</p>
  <div style="border:1px solid #e3e3e0;border-radius:10px;padding:16px 18px;margin:20px 0">
    <div style="font-size:17px;font-weight:600">${esc(task.title)}</div>
    <div style="font-size:14px;color:#666;margin-top:4px">${esc(when)}</div>
    ${instructions ? `<div style="font-size:14px;line-height:1.5;color:#333;margin-top:12px;white-space:pre-wrap">${esc(instructions.slice(0, 1500))}</div>` : ""}
  </div>
  <p style="margin:24px 0"><a href="${link}" style="background:#4f5fd8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Open my to-do list</a></p>
</div>`;
      await sendEmail({ to: r.email, subject: `New task: ${task.title}`, html, text });
    }
  } catch (e) {
    console.error("Task assignment email failed", e);
  }
}
