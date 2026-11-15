import "server-only";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/services/app-settings";

/**
 * Links pinned in the menu, stored per company:
 * - "tools": Tools and reports (e.g. the Schedule Planner in Claude). Owners and admins only.
 * - "links": websites the team uses. Everyone in the company sees them.
 */
export type ToolLink = { id: string; label: string; url: string };
export type LinkKind = "tools" | "links";
export const LINK_KINDS = ["tools", "links"] as const;

// "dash_tools" is the original key for Tools links; kept so existing links stay put.
const key = (workspaceId: string, kind: LinkKind) => (kind === "tools" ? `dash_tools:${workspaceId}` : `links:${workspaceId}`);
const MAX: Record<LinkKind, number> = { tools: 20, links: 50 };

export async function listLinks(workspaceId: string, kind: LinkKind): Promise<ToolLink[]> {
  try {
    const raw = await getSetting(key(workspaceId, kind));
    return raw ? (JSON.parse(raw) as ToolLink[]) : [];
  } catch {
    return [];
  }
}
export const listToolLinks = (workspaceId: string) => listLinks(workspaceId, "tools");

export async function addLink(workspaceId: string, kind: LinkKind, label: string, url: string) {
  const p = z.object({ label: z.string().trim().min(1, "Give the link a name.").max(60), url: z.string().trim().url("That doesn't look like a web address.").refine((u) => /^https?:\/\//i.test(u), "Use a link that starts with https://") }).safeParse({ label, url });
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Check the name and link.");
  const all = await listLinks(workspaceId, kind);
  if (all.length >= MAX[kind]) throw new Error(`That's ${MAX[kind]} links already. Remove one first.`);
  await setSetting(key(workspaceId, kind), JSON.stringify([...all, { id: crypto.randomUUID(), label: p.data.label, url: p.data.url }]));
}

export async function removeLink(workspaceId: string, kind: LinkKind, id: string) {
  const all = await listLinks(workspaceId, kind);
  await setSetting(key(workspaceId, kind), JSON.stringify(all.filter((l) => l.id !== id)));
}
