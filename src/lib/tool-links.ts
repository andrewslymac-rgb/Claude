import "server-only";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/services/app-settings";

/**
 * Links pinned in the menu, stored per company:
 * - "tools": Tools (e.g. the Schedule Planner in Claude). Owners and admins only.
 * - "reports": Reports. Owners and admins only.
 * - "links": websites the team uses. Everyone in the company sees them.
 * - "docs": documents the team uses (Google Docs, Sheets, PDFs…). Everyone sees them too.
 */
export type ToolLink = { id: string; label: string; url: string; description?: string };
export type LinkKind = "tools" | "reports" | "links" | "docs";
export const LINK_KINDS = ["tools", "reports", "links", "docs"] as const;
/** Lists a link can be moved between: Websites ⇄ Documents, Tools ⇄ Reports. */
export const MOVE_PAIRS = { links: "docs", docs: "links", tools: "reports", reports: "tools" } as const satisfies Record<LinkKind, LinkKind>;

// "dash_tools" is the original key for Tools links; kept so existing links stay put.
const key = (workspaceId: string, kind: LinkKind) => (kind === "tools" ? `dash_tools:${workspaceId}` : kind === "reports" ? `report_links:${workspaceId}` : kind === "docs" ? `doc_links:${workspaceId}` : `links:${workspaceId}`);
const MAX: Record<LinkKind, number> = { tools: 30, reports: 30, links: 50, docs: 50 };

export async function listLinks(workspaceId: string, kind: LinkKind): Promise<ToolLink[]> {
  try {
    const raw = await getSetting(key(workspaceId, kind));
    return raw ? (JSON.parse(raw) as ToolLink[]) : [];
  } catch {
    return [];
  }
}
export const listToolLinks = (workspaceId: string) => listLinks(workspaceId, "tools");

const LinkFields = z.object({
  label: z.string().trim().min(1, "Give the link a name.").max(60),
  url: z.string().trim().url("That doesn't look like a web address.").refine((u) => /^https?:\/\//i.test(u), "Use a link that starts with https://"),
  description: z.string().trim().max(500, "Keep the description under 500 characters.").optional().default(""),
});
export type LinkInput = { label: string; url: string; description?: string };
const parseLink = (input: LinkInput) => {
  const p = LinkFields.safeParse(input);
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Check the name and link.");
  return p.data;
};

export async function addLink(workspaceId: string, kind: LinkKind, input: LinkInput) {
  const d = parseLink(input);
  const all = await listLinks(workspaceId, kind);
  if (all.length >= MAX[kind]) throw new Error(`That's ${MAX[kind]} links already. Remove one first.`);
  await setSetting(key(workspaceId, kind), JSON.stringify([...all, { id: crypto.randomUUID(), label: d.label, url: d.url, ...(d.description ? { description: d.description } : {}) }]));
}

/** Changes a link's name, address or description. Its id (and so everyone's stars) stays the same. */
export async function updateLink(workspaceId: string, kind: LinkKind, id: string, input: LinkInput) {
  const d = parseLink(input);
  const all = await listLinks(workspaceId, kind);
  if (!all.some((l) => l.id === id)) throw new Error("That link no longer exists.");
  await setSetting(key(workspaceId, kind), JSON.stringify(all.map((l) => (l.id === id ? { id, label: d.label, url: d.url, ...(d.description ? { description: d.description } : {}) } : l))));
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
  const [stars, ...lists] = await Promise.all([listStars(userId, workspaceId), ...LINK_KINDS.map((k) => listLinks(workspaceId, k))]);
  const exists = new Set(lists.flat().map((l) => l.id));
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

/** Moves a link to its paired list (Websites ⇄ Documents, Tools ⇄ Reports), keeping its id so stars stay with it. */
export async function moveLink(workspaceId: string, from: LinkKind, id: string) {
  const to = MOVE_PAIRS[from];
  const [src, dst] = await Promise.all([listLinks(workspaceId, from), listLinks(workspaceId, to)]);
  const item = src.find((l) => l.id === id);
  if (!item) throw new Error("That link no longer exists.");
  if (dst.length >= MAX[to]) throw new Error(`That's ${MAX[to]} links already. Remove one first.`);
  await setSetting(key(workspaceId, to), JSON.stringify([...dst, item]));
  await setSetting(key(workspaceId, from), JSON.stringify(src.filter((l) => l.id !== id)));
}
