"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAbility } from "@/lib/access";
import { can } from "@/lib/permissions";
import type { AnswerSource } from "@/lib/answers/ask";

type Answer = { ok: true; mode: "ai" | "matches"; covered: boolean; answer: string; sources: AnswerSource[] } | { ok: false; error: string };

const asked = new Map<string, number[]>();
const PER_HOUR = 30;

/**
 * Answers a question from this company's published material, limited to what this person may open.
 * Without an AI key it returns the best-matching sources instead of a written answer.
 */
export async function getAnswerAction(slug: string, question: string): Promise<Answer> {
  try {
    const { user, workspace, abilities } = await requireAbility(slug, "read");
    const q = z.string().trim().min(3, "Ask a longer question.").max(600, "Keep the question under 600 characters.").safeParse(question);
    if (!q.success) return { ok: false, error: q.error.issues[0]?.message ?? "Ask a question." };
    const now = Date.now();
    const recent = (asked.get(user.id) ?? []).filter((t) => now - t < 3600_000);
    if (recent.length >= PER_HOUR) return { ok: false, error: `That's ${PER_HOUR} questions this hour. Try again later.` };
    asked.set(user.id, [...recent, now]);

    const [{ gatherPieces }, ai, log] = await Promise.all([import("@/lib/answers/gather"), import("@/lib/answers/ask"), import("@/lib/answers/log")]);
    const pieces = await gatherPieces({ id: workspace.id, slug: workspace.slug }, { seesAllMeetings: can(abilities, "view_dashboards"), seesSensitive: can(abilities, "view_sensitive") });

    if (!ai.aiEnabled()) {
      const sources = ai.bestMatches(q.data, pieces);
      await log.logQuestion(workspace.id, user.id, q.data, sources.length > 0, sources.length);
      return { ok: true, mode: "matches", covered: sources.length > 0, answer: "", sources };
    }
    const r = await ai.answerQuestion(q.data, pieces);
    await log.logQuestion(workspace.id, user.id, q.data, r.covered, r.sources.length);
    if (!r.covered) revalidatePath(`/w/${slug}`, "layout");
    return { ok: true, mode: "ai", covered: r.covered, answer: r.answer, sources: r.sources };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Owners and admins clear a question they've dealt with (also resolves its flag). */
export async function markQuestionHandledAction(slug: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { workspace, abilities } = await requireAbility(slug, "read");
    if (!can(abilities, "view_dashboards")) throw new Error("Only owners and admins can do that.");
    const { markHandled } = await import("@/lib/answers/log");
    await markHandled(workspace.id, z.string().uuid().parse(id));
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
