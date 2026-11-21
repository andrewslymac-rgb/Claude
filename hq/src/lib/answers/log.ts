import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createFlag } from "@/lib/services/flags";

const { answerQuestions, users, flags } = schema;

const norm = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Records a question. When the company's material couldn't answer it, also raises a flag for
 * owners and admins ("missing document"), unless the same question is already waiting.
 */
export async function logQuestion(workspaceId: string, userId: string, question: string, answered: boolean, sourceCount: number) {
  let flagId: string | null = null;
  if (!answered) {
    const waiting = await db
      .select({ question: answerQuestions.question, flagId: answerQuestions.flagId })
      .from(answerQuestions)
      .where(and(eq(answerQuestions.workspaceId, workspaceId), eq(answerQuestions.answered, false), isNull(answerQuestions.handledAt)));
    const same = waiting.find((w) => norm(w.question) === norm(question));
    if (same) flagId = same.flagId;
    else {
      const f = await createFlag(
        workspaceId,
        {
          title: `No answer for: ${question.slice(0, 140)}`,
          type: "missing_document",
          severity: "low",
          whatWeFound: `Someone asked this on Get an answer and the company's published material didn't cover it:\n\n"${question}"`,
          nextStep: "Write or publish the SOP or document that answers it, then mark this handled on the Get an answer page.",
        },
        userId,
      );
      flagId = f.id;
    }
  }
  await db.insert(answerQuestions).values({ workspaceId, userId, question, answered, sourceCount, flagId });
}

/** Questions the material couldn't answer and nobody has dealt with yet, the most asked first. */
export async function listUnanswered(workspaceId: string) {
  const rows = await db
    .select({ id: answerQuestions.id, question: answerQuestions.question, at: answerQuestions.createdAt, by: users.name, email: users.email })
    .from(answerQuestions)
    .leftJoin(users, eq(users.id, answerQuestions.userId))
    .where(and(eq(answerQuestions.workspaceId, workspaceId), eq(answerQuestions.answered, false), isNull(answerQuestions.handledAt)))
    .orderBy(desc(answerQuestions.createdAt))
    .limit(300);
  const groups = new Map<string, { ids: string[]; question: string; times: number; lastAt: string; askers: Set<string> }>();
  for (const r of rows) {
    const k = norm(r.question);
    const g = groups.get(k) ?? { ids: [], question: r.question, times: 0, lastAt: r.at.toISOString(), askers: new Set<string>() };
    g.ids.push(r.id);
    g.times++;
    g.askers.add(r.by ?? r.email?.split("@")[0] ?? "Someone");
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => ({ id: g.ids[0], question: g.question, times: g.times, lastAt: g.lastAt, askers: [...g.askers] })).sort((a, b) => b.times - a.times || b.lastAt.localeCompare(a.lastAt));
}

/** An owner or admin dealt with it: clears every copy of that question and resolves its flag. */
export async function markHandled(workspaceId: string, id: string) {
  const [row] = await db.select().from(answerQuestions).where(and(eq(answerQuestions.workspaceId, workspaceId), eq(answerQuestions.id, id)));
  if (!row) throw new Error("That question is gone.");
  const open = await db
    .select({ id: answerQuestions.id, question: answerQuestions.question, flagId: answerQuestions.flagId })
    .from(answerQuestions)
    .where(and(eq(answerQuestions.workspaceId, workspaceId), eq(answerQuestions.answered, false), isNull(answerQuestions.handledAt)));
  const same = open.filter((o) => norm(o.question) === norm(row.question));
  for (const o of same) {
    await db.update(answerQuestions).set({ handledAt: new Date() }).where(eq(answerQuestions.id, o.id));
    if (o.flagId) await db.update(flags).set({ status: "resolved", resolvedAt: new Date() }).where(and(eq(flags.id, o.flagId), eq(flags.workspaceId, workspaceId), eq(flags.status, "open")));
  }
}

/** For the page header: how busy it has been lately. */
export async function recentCounts(workspaceId: string) {
  const [r] = await db
    .select({ asked: sql<number>`count(*)::int`, missed: sql<number>`count(*) filter (where not ${answerQuestions.answered})::int` })
    .from(answerQuestions)
    .where(and(eq(answerQuestions.workspaceId, workspaceId), gte(answerQuestions.createdAt, new Date(Date.now() - 30 * 864e5))));
  return r ?? { asked: 0, missed: 0 };
}
