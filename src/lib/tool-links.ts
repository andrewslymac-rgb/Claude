import "server-only";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/services/app-settings";

/** Links an owner pins under Tools (e.g. the Schedule Planner in Claude). Stored per company, not in code. */
export type ToolLink = { id: string; label: string; url: string };
const key = (workspaceId: string) => `dash_tools:${workspaceId}`;

export async function listToolLinks(workspaceId: string): Promise<ToolLink[]> {
  try {
    const raw = await getSetting(key(workspaceId));
    return raw ? (JSON.parse(raw) as ToolLink[]) : [];
  } catch {
    return [];
  }
}

export async function addToolLink(workspaceId: string, label: string, url: string) {
  const p = z.object({ label: z.string().trim().min(1, "Give the link a name.").max(60), url: z.string().trim().url("That doesn't look like a web address.").refine((u) => /^https:\/\//i.test(u), "Use an https:// link.") }).safeParse({ label, url });
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Check the name and link.");
  const all = await listToolLinks(workspaceId);
  if (all.length >= 20) throw new Error("That's 20 links already. Remove one first.");
  await setSetting(key(workspaceId), JSON.stringify([...all, { id: crypto.randomUUID(), label: p.data.label, url: p.data.url }]));
}

export async function removeToolLink(workspaceId: string, id: string) {
  const all = await listToolLinks(workspaceId);
  await setSetting(key(workspaceId), JSON.stringify(all.filter((l) => l.id !== id)));
}
