import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Meeting } from "@/db/schema";
import { stepStatuses } from "./service";

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/** Keep the notes we send under this many characters (about 150K tokens). Newest meetings first. */
const MAX_CONTEXT_CHARS = 600_000;

const SYSTEM = `You answer questions about a small business's internal meetings, using only the meeting notes provided. The notes were written by Google Meet's Gemini note-taker.

How to answer:
- Base every statement on the notes. If the notes don't cover the question, say so plainly and suggest which meeting type might.
- Cite the meetings you used with their tag, like [#3]. Put the tag right after the sentence it supports. Use only tags that appear in the notes.
- Each next step has a status from the company's task tracker: open (nobody has acted on it yet, with how long ago it came up), a task with its due date, or done. When asked what is unfinished, outstanding or forgotten, use those statuses and list the oldest first.
- Write for a busy owner reading on a phone: lead with the answer, short sentences, a short bulleted list when there are several items, no headings, no preamble.
- Names are as Gemini wrote them; "Office Manager" may be an account name rather than a person's name.`;

const TZ = "America/Los_Angeles";
const when = (d: Date) => d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ });

/** One meeting as plain text for the model, tagged [#n]. */
function render(n: number, m: Meeting, status: Awaited<ReturnType<typeof stepStatuses>>) {
  const st = status.get(m.id) ?? [];
  const age = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 864e5));
  const lines = [`[#${n}] ${m.series} | ${when(m.occurredAt)}${m.attendees.length ? ` | attendees: ${m.attendees.join(", ")}` : ""}`];
  if (m.summary) lines.push(`Summary: ${m.summary}`);
  for (const p of m.summaryPoints) lines.push(`- ${p.title}: ${p.text}`);
  if (m.decisions.length) {
    lines.push("Decisions:");
    for (const d of m.decisions) lines.push(`- ${d.title}${d.text ? `: ${d.text}` : ""}`);
  }
  if (m.nextSteps.length) {
    lines.push("Next steps:");
    m.nextSteps.forEach((s, i) => {
      const x = st[i];
      const status = !x || x.status === "open" ? `open, raised ${age(m.occurredAt)} days ago` : x.status === "done" ? "done" : `task${x.taskDue ? ` due ${x.taskDue}` : ""}${x.taskOverdue ? " (overdue)" : ""}`;
      lines.push(`- [${s.owner ?? "unassigned"}] ${s.title}${s.text ? `: ${s.text}` : ""} (status: ${status})`);
    });
  }
  if (m.topics.length) {
    lines.push("Discussed:");
    for (const t of m.topics) lines.push(`- ${t.title}: ${t.text}`);
  }
  return lines.join("\n");
}

export type AskResult = { answer: string; cited: { tag: number; id: string; series: string; at: string }[]; searched: number; total: number };

/**
 * Answers a question from the meetings this person may see (already filtered by the caller,
 * one company only). Returns the answer plus the meetings it cited.
 */
export async function askMeetings(question: string, list: Meeting[]): Promise<AskResult> {
  if (!aiEnabled()) throw new Error("Ask isn't set up yet. An owner adds an ANTHROPIC_API_KEY in Railway (see the note on this page).");
  if (!list.length) return { answer: "There are no meeting notes to search yet.", cited: [], searched: 0, total: 0 };
  const status = await stepStatuses(list);
  const blocks: string[] = [];
  let size = 0;
  for (let i = 0; i < list.length; i++) {
    const b = render(i + 1, list[i], status);
    if (size + b.length > MAX_CONTEXT_CHARS) break;
    blocks.push(b);
    size += b.length;
  }
  const searched = blocks.length;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: TZ });

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // Re-runs on a fallback model if the request is declined by a safety classifier.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      // The notes are the stable prefix; caching makes follow-up questions cheaper.
      system: [
        { type: "text", text: SYSTEM },
        { type: "text", text: `Meeting notes, newest first (${searched} meetings):\n\n${blocks.join("\n\n")}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: `Today is ${today}.\n\nQuestion: ${question}` }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("The AI key in Railway isn't valid. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Too many questions at once. Try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new Error(`The AI service had a problem (${e.status ?? "network"}). Try again.`);
    throw e;
  }
  if (response.stop_reason === "refusal") return { answer: "That question couldn't be answered. Try rephrasing it.", cited: [], searched, total: list.length };

  const answer = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const tags = [...new Set([...answer.matchAll(/\[#(\d+)\]/g)].map((m) => Number(m[1])))].filter((n) => n >= 1 && n <= searched);
  return {
    answer: answer || "No answer came back. Try rephrasing the question.",
    cited: tags.map((t) => ({ tag: t, id: list[t - 1].id, series: list[t - 1].series, at: list[t - 1].occurredAt.toISOString() })),
    searched,
    total: list.length,
  };
}
