import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { listLinks } from "@/lib/tool-links";
import { listMeetings, meetingLabel } from "@/lib/meetings/service";
import { listTasks } from "@/lib/services/tasks";
import { FREQUENCY_LABELS } from "@/lib/recurrence";
import { chunk, type Piece } from "./rank";

const { pages } = schema;
const MEETING_DAYS = 365;

export type Viewer = { seesAllMeetings: boolean; seesSensitive: boolean };

/**
 * Everything "Get an answer" may draw on for one person in one company. The rules live here,
 * at the data layer, so nothing the person couldn't open themselves can reach an answer:
 * - one company only (every query is filtered by workspace);
 * - pages and documents only when their status is Active (published), never Draft, Needs
 *   review, Outdated or unset; Drive documents only when they sit in a connected document area;
 * - pages marked sensitive only for people allowed to see sensitive documents;
 * - meetings only of the types this person can see;
 * - Locked Links are never read here.
 */
export async function gatherPieces(workspace: { id: string; slug: string }, viewer: Viewer): Promise<Piece[]> {
  const base = `/w/${workspace.slug}`;
  const [pageRows, meetings, tasks, linkLists] = await Promise.all([
    db
      .select({ id: pages.id, title: pages.title, text: pages.contentText, isSop: pages.isSop, docType: pages.docType, area: pages.area, source: pages.source, conn: pages.driveConnectionId, sensitive: pages.sensitive })
      .from(pages)
      .where(and(eq(pages.workspaceId, workspace.id), isNull(pages.archivedAt), eq(pages.docStatus, "active"))),
    listMeetings(workspace.id, viewer.seesAllMeetings),
    listTasks(workspace.id),
    Promise.all((["tools", "reports", "docs", "customer_docs", "links"] as const).map(async (k) => [k, await listLinks(workspace.id, k)] as const)),
  ]);
  const out: Piece[] = [];

  for (const p of pageRows) {
    if (p.sensitive && !viewer.seesSensitive) continue;
    if (p.source === "gdrive" && !p.conn) continue; // not filed in a document area
    if (!p.text.trim()) continue;
    const note = [p.isSop ? "SOP" : p.docType || "Document", p.area].filter(Boolean).join(" · ");
    for (const text of chunk(p.text)) out.push({ sourceKey: `page:${p.id}`, kind: "page", title: p.title || "Untitled", href: `${base}/p/${p.id}`, note, text });
  }

  const since = Date.now() - MEETING_DAYS * 864e5;
  for (const m of meetings) {
    if (m.occurredAt.getTime() < since) continue;
    const text = [
      m.summary,
      ...m.summaryPoints.map((x) => `${x.title}: ${x.text}`),
      m.decisions.length ? `Decisions:\n${m.decisions.map((d) => `- ${d.title}: ${d.text}`).join("\n")}` : "",
      m.nextSteps.length ? `Next steps:\n${m.nextSteps.map((n) => `- ${n.owner ? `${n.owner}: ` : ""}${n.title}. ${n.text}`).join("\n")}` : "",
      ...m.topics.map((t) => `${t.title}: ${t.text}`),
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!text.trim()) continue;
    const label = meetingLabel(m);
    for (const part of chunk(text)) out.push({ sourceKey: `meeting:${m.id}`, kind: "meeting", title: label.split(" · ").slice(1).join(" · "), href: `${base}/meetings/${m.id}`, note: "Meeting notes", text: part });
  }

  for (const t of tasks) {
    const who = t.assignees.map((a) => a.name).join(", ") || t.role?.name || t.ownerRole || "anyone";
    const text = [`${FREQUENCY_LABELS[t.frequency]} task${t.whenText ? ` (${t.whenText})` : ""}. Owner: ${who}.`, t.instructions].filter(Boolean).join("\n\n");
    out.push({ sourceKey: `task:${t.id}`, kind: "task", title: t.title, href: `${base}/tasks/${t.id}`, note: `Task · ${who}`, text: text.slice(0, 6000) });
  }

  const LIST = { tools: "Tools", reports: "Reports", docs: "Important Document Links", customer_docs: "Customer Facing Documents", links: "Websites" } as const;
  for (const [kind, list] of linkLists)
    for (const l of list) out.push({ sourceKey: `link:${kind}:${l.id}`, kind: "link", title: l.label, href: l.url, external: true, note: LIST[kind], text: [`A link listed under ${LIST[kind]}.`, l.description ?? "", l.url].filter(Boolean).join(" ") });

  return out;
}
