import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AiPrincipal } from "@/lib/services/ai-auth";
import { logActivity } from "@/lib/services/ai-auth";
import { createProposal, needsApproval } from "@/lib/services/ai-proposals";
import * as pagesSvc from "@/lib/services/pages";
import * as tasksSvc from "@/lib/services/tasks";
import * as flagsSvc from "@/lib/services/flags";
import { listWidgets } from "@/lib/services/dashboard";
import { blocksToMarkdown, markdownToBlocks } from "@/lib/markdown";
import { fmtDate, FREQUENCY_LABELS, DUE_LABELS } from "@/lib/recurrence";
import type { Actor } from "@/lib/services/actor";
import type { Frequency } from "@/db/schema";
import { storeSnapshot } from "@/lib/integrations/jobber";
import { workspaceForUserBySlug } from "@/lib/services/workspaces";

const MAX_WRITE_CHARS = 60_000;

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const fail = (s: string) => ({ content: [{ type: "text" as const, text: s }], isError: true });

/**
 * Builds the MCP server for one authenticated principal (one grant = one workspace).
 * Tools are only registered if the grant's scopes allow them, so an AI tool never
 * even sees a capability it isn't allowed to use.
 */
export function buildServer(p: AiPrincipal) {
  const server = new McpServer({ name: "Orbit", version: "0.4.0" }, { instructions: `You are connected to Orbit, the company headquarters for ${p.workspaceName}. Pages hold SOPs, policies and company knowledge. Tasks are recurring operations work. Always search before answering questions about policy, and cite the page title. Pages marked "Needs review" or "Draft" may not be approved. Edits to SOPs and policies go to an approval queue for a person to review before they apply; tell the user when that happens.` });
  const actor: Actor = { type: "ai", tokenId: p.grantId, userId: p.userId };
  const ws = p.workspaceId;
  const can = (s: string) => (p.scopes as string[]).includes(s);
  const link = (id: string) => `${process.env.APP_URL ?? ""}/w/${p.workspaceSlug}/p/${id}`;
  const queued = (what: string) => text(`${what} was sent to Orbit's approval queue because it touches an SOP or policy. An admin will review it under AI activity → Needs approval. Nothing has changed yet.`);

  // ------------------------------------------------------------------ read
  server.registerTool(
    "search",
    { title: "Search pages", description: "Full-text search across pages, SOPs and policies. Returns titles, ids and a snippet.", inputSchema: { query: z.string().min(1).max(200), limit: z.number().int().min(1).max(50).optional() } },
    async ({ query, limit }) => {
      const hits = await pagesSvc.searchPages(ws, query, limit ?? 10);
      if (!hits.length) return text("No pages matched.");
      return text(hits.map((h) => `- ${h.icon ?? ""} ${h.title || "Untitled"}${h.isSop ? " [SOP]" : ""} (id: ${h.id})${h.snippet ? `\n  …${h.snippet}…` : ""}`).join("\n"));
    },
  );

  server.registerTool("list_pages", { title: "List pages", description: "The page tree of the workspace: every page with its id, parent and whether it is an SOP.", inputSchema: {} }, async () => {
    const tree = await pagesSvc.listTree(ws);
    const byParent = new Map<string | null, typeof tree>();
    for (const n of tree) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]);
    const render = (parent: string | null, depth: number): string => (byParent.get(parent) ?? []).map((n) => `${"  ".repeat(depth)}- ${n.icon ?? ""} ${n.title || "Untitled"}${n.isSop ? " [SOP]" : ""} (id: ${n.id})\n${render(n.id, depth + 1)}`).join("");
    return text(render(null, 0) || "No pages yet.");
  });

  server.registerTool("list_sops", { title: "List SOPs and policies", description: "Every page marked as an SOP or policy, with its review status.", inputSchema: {} }, async () => {
    const docs = await pagesSvc.listLibrary(ws);
    if (!docs.length) return text("No SOPs yet.");
    return text(docs.map((d) => `- ${d.icon ?? ""} ${d.title} (id: ${d.id})${d.docType ? ` · ${d.docType}` : ""}${d.docStatus ? ` · ${d.docStatus.replace("_", " ")}` : ""}${d.lastReviewedOn ? ` · reviewed ${fmtDate(d.lastReviewedOn)}` : " · never reviewed"}`).join("\n"));
  });

  server.registerTool("get_page", { title: "Read a page", description: "Returns a page's content as Markdown, plus its document info (status, owner, last reviewed).", inputSchema: { page_id: z.string().uuid() } }, async ({ page_id }) => {
    const page = await pagesSvc.getPage(ws, page_id);
    if (!page || page.archivedAt) return fail("Page not found.");
    const md = page.contentText || (await blocksToMarkdown(page.content));
    const meta = [page.docType && `Type: ${page.docType}`, page.docStatus && `Status: ${page.docStatus.replace("_", " ")}`, page.lastReviewedOn && `Last reviewed: ${fmtDate(page.lastReviewedOn)}`, page.source === "gdrive" && "Source: Google Drive (read-only here)", `Link: ${link(page.id)}`].filter(Boolean).join(" · ");
    return text(`# ${page.icon ?? ""} ${page.title || "Untitled"}\n_${meta}_\n\n${md}`);
  });

  server.registerTool("list_tasks", { title: "List tasks", description: "Recurring and one-off tasks with due state, owner and frequency. Filter by 'attention' (overdue or due today) or a frequency.", inputSchema: { filter: z.enum(["all", "attention", "daily", "weekly", "monthly", "quarterly", "annual", "once"]).optional() } }, async ({ filter }) => {
    const all = await tasksSvc.listTasks(ws);
    const rows = all.filter((t) => !filter || filter === "all" || (filter === "attention" ? t.state === "overdue" || t.state === "today" : t.frequency === filter));
    if (!rows.length) return text("No tasks match.");
    return text(rows.map((t) => `- ${t.title} (id: ${t.id}) · ${FREQUENCY_LABELS[t.frequency]}${t.whenText ? ` · ${t.whenText}` : ""} · ${DUE_LABELS[t.state].label}${t.nextDueOn ? ` ${fmtDate(t.nextDueOn)}` : ""} · owner: ${t.assignees.map((a) => a.name).join(", ") || t.ownerRole || "anyone"}${t.category ? ` · ${t.category}` : ""}`).join("\n"));
  });

  server.registerTool("list_flags", { title: "List open flags", description: "Open questions, contradictions and compliance risks waiting on a decision.", inputSchema: {} }, async () => {
    const flags = (await flagsSvc.listFlags(ws)).filter((f) => f.status === "open" || f.status === "in_progress");
    if (!flags.length) return text("No open flags.");
    return text(flags.map((f) => `- [${f.severity}] ${f.title} (${f.type.replace("_", " ")}${f.pageTitle ? `, about "${f.pageTitle}"` : ""})${f.whatWeFound ? `\n  ${f.whatWeFound}` : ""}`).join("\n"));
  });

  server.registerTool("get_dashboard", { title: "Dashboard summary", description: "What the workspace home shows: tasks needing attention, documents due for review, open flags, quick links.", inputSchema: {} }, async () => {
    const [tasks, docs, flags, widgets] = await Promise.all([tasksSvc.listTasks(ws), pagesSvc.listLibrary(ws), flagsSvc.listFlags(ws), listWidgets(ws)]);
    const attention = tasks.filter((t) => t.state === "overdue" || t.state === "today");
    const links = widgets.filter((w) => w.type === "links").flatMap((w) => w.config.links ?? []);
    return text(
      [
        `# ${p.workspaceName}`,
        `Tasks needing attention: ${attention.length}${attention.length ? "\n" + attention.map((t) => `- ${t.title} (${DUE_LABELS[t.state].label})`).join("\n") : ""}`,
        `Documents: ${docs.length} (${docs.filter((d) => d.docStatus === "needs_review").length} need review)`,
        `Open flags: ${flags.filter((f) => f.status === "open").length}`,
        links.length ? `Tools: ${links.map((l) => `${l.label} (${l.url})`).join(", ")}` : "",
      ].join("\n\n"),
    );
  });

  // ------------------------------------------------------------------ write: pages
  if (can("write:pages")) {
    server.registerTool(
      "create_page",
      { title: "Create a page", description: "Creates a page from Markdown. Optionally nest it under a parent page and mark it as an SOP.", inputSchema: { title: z.string().min(1).max(200), markdown: z.string().max(MAX_WRITE_CHARS), parent_id: z.string().uuid().optional(), is_sop: z.boolean().optional(), reason: z.string().max(300).optional() } },
      async ({ title, markdown, parent_id, is_sop, reason }) => {
        if (await needsApproval(ws, { isSop: is_sop })) {
          await createProposal(ws, p.grantId, { tool: "create_page", parentId: parent_id ?? null, title, markdown, isSop: Boolean(is_sop), reason: reason ?? "Created by AI" });
          return queued(`Creating "${title}"`);
        }
        const page = await pagesSvc.createPage(ws, { parentId: parent_id ?? null, title }, actor);
        const blocks = await markdownToBlocks(markdown);
        await pagesSvc.updatePage(ws, page.id, { content: blocks, contentText: markdown }, actor, reason ?? "Created by AI");
        if (is_sop) await pagesSvc.setSop(ws, page.id, true);
        await logActivity({ workspaceId: ws, grantId: p.grantId, tool: "create_page", summary: `Created page "${title}"${reason ? ` — ${reason}` : ""}`, pageId: page.id });
        return text(`Created "${title}" (id: ${page.id}). ${link(page.id)}`);
      },
    );

    server.registerTool(
      "update_page",
      { title: "Replace a page's content", description: "Replaces the whole body of a page with new Markdown (title optional). The previous version is kept and can be restored. Not allowed on Google Drive-synced pages.", inputSchema: { page_id: z.string().uuid(), markdown: z.string().max(MAX_WRITE_CHARS), title: z.string().min(1).max(200).optional(), reason: z.string().min(3).max(300).describe("One sentence on what changed and why; shown in the page's history") } },
      async ({ page_id, markdown, title, reason }) => {
        const before = await pagesSvc.getPage(ws, page_id);
        if (!before || before.archivedAt) return fail("Page not found.");
        if (before.source === "gdrive") return fail("This page is synced from Google Drive. Edit the Google Doc instead.");
        if (await needsApproval(ws, { pageId: page_id })) {
          await createProposal(ws, p.grantId, { tool: "update_page", pageId: page_id, title: title ?? null, markdown, reason });
          return queued(`Rewriting "${before.title}"`);
        }
        const prev = (await pagesSvc.listVersions(page_id))[0];
        const blocks = await markdownToBlocks(markdown);
        await pagesSvc.updatePage(ws, page_id, { content: blocks, contentText: markdown, title }, actor, reason);
        await logActivity({ workspaceId: ws, grantId: p.grantId, tool: "update_page", summary: `Edited "${title ?? before.title}" — ${reason}`, pageId: page_id, undoVersionId: prev?.id ?? null });
        return text(`Updated "${title ?? before.title}". Previous version kept. ${link(page_id)}`);
      },
    );

    server.registerTool(
      "append_to_page",
      { title: "Append to a page", description: "Adds Markdown to the end of a page without touching what's already there.", inputSchema: { page_id: z.string().uuid(), markdown: z.string().min(1).max(MAX_WRITE_CHARS), reason: z.string().min(3).max(300) } },
      async ({ page_id, markdown, reason }) => {
        const before = await pagesSvc.getPage(ws, page_id);
        if (!before || before.archivedAt) return fail("Page not found.");
        if (before.source === "gdrive") return fail("This page is synced from Google Drive. Edit the Google Doc instead.");
        if (await needsApproval(ws, { pageId: page_id })) {
          await createProposal(ws, p.grantId, { tool: "append_to_page", pageId: page_id, markdown, reason });
          return queued(`Adding to "${before.title}"`);
        }
        const prev = (await pagesSvc.listVersions(page_id))[0];
        const added = await markdownToBlocks(markdown);
        const content = [...before.content, ...added];
        const contentText = `${before.contentText}\n\n${markdown}`.trim();
        await pagesSvc.updatePage(ws, page_id, { content, contentText }, actor, reason);
        await logActivity({ workspaceId: ws, grantId: p.grantId, tool: "append_to_page", summary: `Appended to "${before.title}" — ${reason}`, pageId: page_id, undoVersionId: prev?.id ?? null });
        return text(`Appended to "${before.title}". ${link(page_id)}`);
      },
    );
  }

  // ------------------------------------------------------------------ write: tasks
  if (can("write:tasks")) {
    server.registerTool(
      "create_task",
      { title: "Create a task", description: "Creates a one-off or recurring task.", inputSchema: { title: z.string().min(1).max(200), frequency: z.enum(["once", "daily", "weekly", "monthly", "quarterly", "annual"]).optional(), when_text: z.string().max(120).optional().describe('e.g. "Every Friday" or "By the 5th"'), due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), category: z.string().max(40).optional(), instructions: z.string().max(5000).optional(), owner_role: z.string().max(60).optional() } },
      async (a) => {
        const t = await tasksSvc.createTask(ws, { title: a.title, frequency: (a.frequency ?? "once") as Frequency, whenText: a.when_text, dueOn: a.due_on, category: a.category, instructions: a.instructions, ownerRole: a.owner_role }, p.userId);
        await logActivity({ workspaceId: ws, grantId: p.grantId, tool: "create_task", summary: `Created task "${a.title}" (${FREQUENCY_LABELS[t.frequency]})`, taskId: t.id });
        return text(`Created task "${a.title}" (id: ${t.id}), next due ${t.nextDueOn ? fmtDate(t.nextDueOn) : "unscheduled"}.`);
      },
    );

    server.registerTool("complete_task", { title: "Mark a task done", description: "Marks a task done today (or on a given date).", inputSchema: { task_id: z.string().uuid(), done_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() } }, async ({ task_id, done_on }) => {
      await tasksSvc.completeTask(ws, task_id, p.userId, done_on);
      const t = (await tasksSvc.listTasks(ws)).find((x) => x.id === task_id);
      await logActivity({ workspaceId: ws, grantId: p.grantId, tool: "complete_task", summary: `Marked "${t?.title ?? task_id}" done`, taskId: task_id });
      return text(`Done. ${t ? `Next due ${t.nextDueOn ? fmtDate(t.nextDueOn) : "—"}.` : ""}`);
    });
  }

  // ------------------------------------------------------------------ dashboard feeds
  if (can("write:tasks")) {
    const money = { count: z.number().int().min(0), total: z.number().min(0) };
    server.registerTool(
      "update_field_service_snapshot",
      {
        title: "Update the live jobs tile on the dashboard",
        description:
          "Pushes today's field-service numbers (from Jobber or GorillaDesk, whichever the company uses) onto its dashboard: today's visits, new requests or leads, quotes or estimates awaiting a response, past-due and unpaid invoices. Use it after reading the numbers through the Jobber or LeadSprint/GorillaDesk connector. Pass workspace (the company slug, e.g. lemon-and-lavender or adapt-pest-pros) to update a different company than this connection's; the signed-in person must have access to it.",
        inputSchema: {
          workspace: z.string().max(80).optional(),
          today: z
            .array(z.object({ id: z.string().max(200), title: z.string().max(200), start_at: z.string().max(40), end_at: z.string().max(40).optional(), completed: z.boolean().optional(), client: z.string().max(200).optional(), address: z.string().max(300).optional(), assignees: z.array(z.string().max(100)).max(10).optional() }))
            .max(100),
          requests_new: z.number().int().min(0),
          quotes_awaiting: z.object(money),
          invoices_past_due: z.object(money),
          invoices_awaiting: z.object(money).optional(),
          note: z.string().max(200).optional().describe("Shown under the tile, e.g. 'Updated by Claude at 5:40 AM'"),
        },
      },
      async (a) => {
        const target = await workspaceForUserBySlug(p.userId, a.workspace ?? p.workspaceSlug);
        if (!target) return fail(`You don't have access to a company called "${a.workspace}".`);
        if (target.fieldTool === "none") return fail(`${target.name} has no field-service software set. Choose Jobber or GorillaDesk under Settings → Workspace first.`);
        const snap = await storeSnapshot(
          target.id,
          {
            today: a.today.map((v) => ({ id: v.id, title: v.title, startAt: v.start_at, endAt: v.end_at ?? null, completed: v.completed ?? false, client: v.client ?? "", address: v.address ?? "", assignees: v.assignees ?? [] })),
            requestsNew: a.requests_new,
            quotesAwaiting: a.quotes_awaiting,
            invoicesPastDue: a.invoices_past_due,
            invoicesAwaiting: a.invoices_awaiting ?? { count: 0, total: 0 },
            note: a.note,
          },
          `Claude (${p.name})`,
          p.userId,
          target.fieldTool,
        );
        await logActivity({ workspaceId: target.id, grantId: p.grantId, tool: "update_field_service_snapshot", summary: `Updated the ${target.fieldTool === "gorilladesk" ? "GorillaDesk" : "Jobber"} tile: ${snap.today.length} visits today, ${snap.requestsNew} new requests, ${snap.quotesAwaiting.count} quotes waiting, ${snap.invoicesPastDue.count} overdue invoices` });
        return text(`Dashboard updated for ${target.name}: ${snap.today.length} visits today, ${snap.requestsNew} new requests, ${snap.quotesAwaiting.count} quotes waiting ($${snap.quotesAwaiting.total}), ${snap.invoicesPastDue.count} overdue invoices ($${snap.invoicesPastDue.total}).`);
      },
    );
  }

  return server;
}
