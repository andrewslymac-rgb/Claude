import "server-only";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/services/app-settings";

/**
 * Links pinned in the menu, stored per company:
 * - "tools": Tools and reports (e.g. the Schedule Planner in Claude). Owners and admins only.
 * - "links": websites the team uses. Everyone in the company sees them.
 * - "docs": documents the team uses (Google Docs, Sheets, PDFs…). Everyone sees them too.
 */
export type ToolLink = { id: string; label: string; url: string };
export type LinkKind = "tools" | "links" | "docs";
export const LINK_KINDS = ["tools", "links", "docs"] as const;

// "dash_tools" is the original key for Tools links; kept so existing links stay put.
const key = (workspaceId: string, kind: LinkKind) => (kind === "tools" ? `dash_tools:${workspaceId}` : kind === "docs" ? `doc_links:${workspaceId}` : `links:${workspaceId}`);
const MAX: Record<LinkKind, number> = { tools: 20, links: 50, docs: 50 };

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

/* ---------- Stars: each person's own favourites, kept at the top of their lists ---------- */

export type StarredLink = ToolLink & { starred: boolean };
const starKey = (userId: string, workspaceId: string) => `link_stars:${workspaceId}:${userId}`;

export async function listStars(userId: string, workspaceId: string): Promise<string[]> {
  try {
    const raw = await getSetting(starKey(userId, workspaceId));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Stars or unstars one link for this person. Stars only point at links that still exist. */
export async function toggleStar(userId: string, workspaceId: string, linkId: string) {
  const [stars, tools, links, docs] = await Promise.all([listStars(userId, workspaceId), listLinks(workspaceId, "tools"), listLinks(workspaceId, "links"), listLinks(workspaceId, "docs")]);
  const exists = new Set([...tools, ...links, ...docs].map((l) => l.id));
  if (!exists.has(linkId)) throw new Error("That link no longer exists.");
  const next = stars.includes(linkId) ? stars.filter((s) => s !== linkId) : [...stars, linkId];
  await setSetting(starKey(userId, workspaceId), JSON.stringify(next.filter((s) => exists.has(s))));
}

/** Starred links first (in the order they were starred), then the rest in their usual order. */
export function withStars(links: ToolLink[], stars: string[]): StarredLink[] {
  const rank = new Map(stars.map((s, i) => [s, i]));
  const starred = links.filter((l) => rank.has(l.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const rest = links.filter((l) => !rank.has(l.id));
  return [...starred.map((l) => ({ ...l, starred: true })), ...rest.map((l) => ({ ...l, starred: false }))];
}
