/**
 * Reads a Google Meet "Notes by Gemini" doc (exported as Markdown) into plain parts:
 * summary, decisions, next steps and topic details. Nothing is rewritten or invented:
 * every line comes straight from Gemini's notes. Anything unrecognised is left out and
 * the meeting still links to the full doc.
 */

export type NextStep = { owner: string | null; title: string; text: string };
export type Decision = { title: string; text: string };
export type Topic = { title: string; text: string };
export type ParsedMeeting = {
  series: string;
  /** ISO timestamp if the file name carried a date and time, else null. */
  occurredAt: string | null;
  attendees: string[];
  /** Gemini's one-line overview. */
  summary: string;
  /** The bolded summary sections under it ("IT and Invoicing Errors" → text). */
  summaryPoints: Topic[];
  decisions: Decision[];
  nextSteps: NextStep[];
  topics: Topic[];
  /** True when at least the summary or next steps were found. */
  recognised: boolean;
};

const TZ_OFFSETS: Record<string, string> = { PST: "-08:00", PDT: "-07:00", MST: "-07:00", MDT: "-06:00", CST: "-06:00", CDT: "-05:00", EST: "-05:00", EDT: "-04:00", UTC: "+00:00", GMT: "+00:00" };

/** "Adapt Weekly Admin Meeting - 2026/11/13 08:55 PST - Notes by Gemini" → series + time. */
export function parseTitle(name: string): { series: string; occurredAt: string | null } {
  const clean = name.replace(/\s*-\s*Notes by Gemini\s*$/i, "").trim();
  const m = clean.match(/^(.*?)\s*-?\s*(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\s*([A-Z]{2,4})?$/);
  if (!m) return { series: clean || "Meeting", occurredAt: null };
  const [, title, y, mo, d, h, mi, tz] = m;
  const off = TZ_OFFSETS[tz ?? ""] ?? "-08:00";
  const series = title.replace(/^Meeting started$/i, "Meeting").replace(/\s+-\s*$/, "").trim() || "Meeting";
  return { series, occurredAt: new Date(`${y}-${mo}-${d}T${h}:${mi}:00${off}`).toISOString() };
}

/** Removes Markdown decoration Google adds: bold/italic marks, escaped brackets, timestamp links. */
export function tidy(s: string) {
  return s
    .replace(/\s*\(\[\d{2}:\d{2}:\d{2}\]\([^)]*\)\)/g, "") // ([00:06:14](link))
    .replace(/\[([^\]]+)\]\((?:mailto:|https?:)[^)]*\)/g, "$1") // [text](link) → text
    .replace(/\\([[\]()*_#.-])/g, "$1")
    .replace(/\*\*\*|\*\*|__/g, "")
    .replace(/(^|\s)\*(\S[^*]*\S|\S)\*(?=\s|$|[.,:;])/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .trim();
}

type Block = { heading: string; level: number; lines: string[] };

function blocks(md: string): Block[] {
  const out: Block[] = [{ heading: "", level: 0, lines: [] }];
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) out.push({ heading: tidy(h[2]).replace(/^[^\p{L}\p{N}]+/u, "").trim(), level: h[1].length, lines: [] });
    else out[out.length - 1].lines.push(raw);
  }
  return out;
}

const bullets = (lines: string[]) =>
  lines
    .map((l) => l.match(/^\s*[-*•]\s+(.*)$/)?.[1])
    .filter((x): x is string => Boolean(x && x.trim()))
    .map((x) => x.trim());

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const paragraphs = (lines: string[]) =>
  lines
    .join("\n")
    .split(/\n\s*\n|\n-{3,}\n/)
    .map((p) => tidy(p.replace(/\s*\n\s*/g, " ")))
    .filter((p) => p && !/^-{3,}$/.test(p));

export function parseGeminiMarkdown(fileName: string, md: string): ParsedMeeting {
  const { series, occurredAt } = parseTitle(fileName);
  // Gemini docs repeat the notes ("Quick notes" then "Full notes"), then the transcript.
  // Use the Full notes part when present, and never read into the transcript.
  const fullAt = md.search(/^#\s+\**[^\n]*Full notes/im);
  const transcriptAt = md.search(/^#\s+\**[^\n]*Transcript/im);
  let body = fullAt >= 0 ? md.slice(fullAt) : md;
  const tAt = body.search(/^#\s+\**[^\n]*Transcript/im);
  if (tAt > 0) body = body.slice(0, tAt);
  else if (fullAt < 0 && transcriptAt > 0) body = md.slice(0, transcriptAt);

  const bs = blocks(body);
  const find = (re: RegExp) => bs.find((b) => re.test(b.heading));

  // Attendees: the "Invited" line, or the first line of mailto links.
  const inviteLine = body.split("\n").find((l) => /^\s*Invited\b/i.test(l)) ?? body.split("\n").find((l) => /\(mailto:/.test(l)) ?? "";
  const attendees = [...inviteLine.matchAll(/\[([^\]]+)\]\(mailto:[^)]*\)/g)].map((m) => tidy(m[1])).filter((v, i, a) => v && a.indexOf(v) === i);

  // Summary: everything under "Summary" up to the next heading, bold sub-heads kept as line starts.
  const sumBlock = find(/^summary$/i);
  let summary = "";
  const summaryPoints: Topic[] = [];
  if (sumBlock) {
    let cur: Topic | null = null;
    const flush = () => cur && (cur.text = tidy(cur.text)) && summaryPoints.push(cur);
    for (const raw of sumBlock.lines) {
      const line = raw.trim();
      if (!line) continue;
      const head = line.match(/^\*\*([^*]+)\*\*\s*$/);
      if (head) {
        flush();
        cur = { title: tidy(head[1]), text: "" };
      } else if (cur) cur.text += ` ${line}`;
      else summary = tidy(`${summary} ${line}`);
    }
    flush();
  }

  // Decisions: Gemini puts them under "Decisions" → "Aligned" (sometimes "Needs further discussion").
  const decisions: Decision[] = [];
  const di = bs.findIndex((b) => /^decisions$/i.test(b.heading));
  if (di >= 0) {
    for (let i = di; i < bs.length; i++) {
      if (i > di && bs[i].level <= bs[di].level && !/^(aligned|needs further discussion|open questions?)$/i.test(bs[i].heading)) break;
      if (/^(next steps|details)$/i.test(bs[i].heading)) break;
      const prefix = /needs further discussion|open question/i.test(bs[i].heading) ? "Open: " : "";
      for (const b of bullets(bs[i].lines)) {
        const m = b.match(/^\*\*(.+?)\*\*\s*[:.-]?\s*(.*)$/);
        decisions.push(m ? { title: prefix + tidy(m[1]), text: tidy(m[2]) } : { title: prefix + tidy(b), text: "" });
      }
    }
  }

  // Next steps: "[Owner] Title: what to do".
  const nsBlock = find(/^(next steps|suggested next steps|action items)$/i);
  const nextSteps: NextStep[] = (nsBlock ? bullets(nsBlock.lines) : []).map((b) => {
    const t = tidy(b.replace(/^\[\s*\]\s*/, ""));
    const m = t.match(/^\[([^\]]+)\]\s*(.*)$/);
    const owner = m ? m[1].trim() : null;
    const rest = m ? m[2] : t;
    const c = rest.match(/^([^:]{2,80}):\s+(.+)$/);
    return { owner, title: c ? c[1].trim() : rest, text: c ? c[2].trim() : "" };
  });

  // Details: paragraphs that start with "**Topic**: text".
  const detBlock = find(/^details$/i);
  const topics: Topic[] = [];
  if (detBlock) {
    for (const p of detBlock.lines.join("\n").split(/\n\s*\n|\n-{3,}\n/)) {
      const m = p.trim().match(/^\*\*(.+?)\*\*\s*:?\s*([\s\S]*)$/);
      if (m) topics.push({ title: tidy(m[1]).replace(/:$/, ""), text: tidy(m[2].replace(/\s*\n\s*/g, " ")) });
    }
  }
  // Older/short notes: topics are "## Topic" headings with bullets under them, before "Next steps".
  if (!topics.length && !detBlock) {
    for (const b of bs) {
      if (b.level >= 2 && b.heading && !/^(summary|decisions|aligned|next steps|details|quick notes|full notes|transcript)$/i.test(b.heading) && b.heading !== series) {
        const items = bullets(b.lines).map(tidy);
        if (items.length) topics.push({ title: b.heading, text: items.join(" ") });
      }
    }
  }

  return { series, occurredAt, attendees, summary, summaryPoints, decisions, nextSteps, topics, recognised: Boolean(summary || nextSteps.length || topics.length) };
}
